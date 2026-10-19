package lab.commerce;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.support.DirtiesContextTestExecutionListener;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.*;

/** Real HTTP + MySQL. Admin is a separate fixture-only connection, never the application datasource. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestExecutionListeners(listeners = {DependencyInjectionTestExecutionListener.class,
        DirtiesContextTestExecutionListener.class}, mergeMode = TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(OrdersApiIT.ProbeConfig.class)
class OrdersApiIT {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate app;
    private JdbcTemplate admin;
    private long productId;
    private long aliceId;
    private String alice;
    private String bob;
    private static final String PASSWORD = "only-used-by-isolated-test-fixtures";
    private final JsonMapper json = JsonMapper.builder().build();
    private static final AtomicBoolean FAIL_AFTER_DEDUCTION = new AtomicBoolean();

    @TestConfiguration(proxyBeanMethods = false)
    static class ProbeConfig {
        @Bean Interceptor rollbackProbe() { return new RollbackProbe(); }
    }

    @Intercepts(@Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class}))
    static class RollbackProbe implements Interceptor {
        @Override public Object intercept(Invocation invocation) throws Throwable {
            Object result = invocation.proceed();
            var statement = (MappedStatement) invocation.getArgs()[0];
            if (statement.getId().equals("lab.commerce.mapper.OrderMapper.deductStock")
                    && FAIL_AFTER_DEDUCTION.compareAndSet(true, false)) {
                throw new IllegalStateException("Test-only failure after successful inventory update");
            }
            return result;
        }
    }

    @BeforeEach
    void fixtures() throws Exception {
        FAIL_AFTER_DEDUCTION.set(false);
        String url = System.getenv("COMMERCE_TEST_ADMIN_URL");
        assertThat(url).as("mysql-it requires isolated fixture administrator environment").isNotBlank();
        admin = new JdbcTemplate(new DriverManagerDataSource(url,
                System.getenv("COMMERCE_TEST_ADMIN_USER"), System.getenv("COMMERCE_TEST_ADMIN_PASSWORD")));
        String suffix = UUID.randomUUID().toString().replace("-", "");
        productId = 8_000_000_000L + Math.abs(UUID.randomUUID().getMostSignificantBits() % 1_000_000_000L);
        alice = "it_a_" + suffix;
        bob = "it_b_" + suffix;
        var spec = new PBEKeySpec(PASSWORD.toCharArray(), new byte[16], 210_000, 256);
        String hash = "pbkdf2_sha256$210000$" + Base64.getEncoder().encodeToString(new byte[16]) + "$"
                + Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                        .generateSecret(spec).getEncoded());
        spec.clearPassword();
        admin.update("INSERT INTO lab_user(username,password_hash) VALUES (?,?),(?,?)", alice, hash, bob, hash);
        aliceId = admin.queryForObject("SELECT id FROM lab_user WHERE username=?", Long.class, alice);
        admin.update("INSERT INTO product(id,sku,name,description,price,status) VALUES (?,?,?,?,?,'ACTIVE')",
                productId, "IT-" + suffix, "独立测试商品", "test fixture", "129.90");
        admin.update("INSERT INTO inventory(product_id,available_stock,version) VALUES (?,10,0)", productId);
    }

    @AfterEach
    void cleanFixtures() {
        FAIL_AFTER_DEDUCTION.set(false);
        if (admin == null) return;
        admin.update("DELETE FROM commerce_order WHERE product_id=?", productId);
        admin.update("DELETE FROM inventory WHERE product_id=?", productId);
        admin.update("DELETE FROM product WHERE id=?", productId);
        admin.update("DELETE FROM lab_user WHERE username IN (?,?)", alice, bob);
    }

    class Browser {
        final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies)
                .connectTimeout(Duration.ofSeconds(3)).build();
        String csrf;

        Browser() throws Exception {
            csrf = body(get("/api/v1/auth/session")).get("csrfToken").asString();
        }

        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
        }

        HttpResponse<String> post(String path, String payload) throws Exception { return post(path, payload, csrf); }

        HttpResponse<String> post(String path, String payload, String token) throws Exception {
            var builder = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/json");
            if (token != null) builder.header("X-CSRF-Token", token);
            return client.send(builder.POST(HttpRequest.BodyPublishers.ofString(payload)).build(),
                    HttpResponse.BodyHandlers.ofString());
        }

        Browser login(String username) throws Exception {
            var response = post("/api/v1/auth/login", "{\"username\":\"" + username + "\",\"password\":\"" + PASSWORD + "\"}");
            assertThat(response.statusCode()).isEqualTo(200);
            csrf = body(response).get("csrfToken").asString();
            return this;
        }
    }

    URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    JsonNode body(HttpResponse<String> response) { return json.readTree(response.body()); }
    String payload(int quantity, String key) {
        return "{\"productId\":" + productId + ",\"quantity\":" + quantity + ",\"requestKey\":\"" + key + "\"}";
    }
    int stock() { return admin.queryForObject("SELECT available_stock FROM inventory WHERE product_id=?", Integer.class, productId); }
    int orders() { return admin.queryForObject("SELECT COUNT(*) FROM commerce_order WHERE product_id=?", Integer.class, productId); }
    void error(HttpResponse<String> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(body(response).get("code").asString()).isEqualTo(code);
        assertThat(response.body()).doesNotContain("jdbc:", "SELECT ", "INSERT ", "password_hash", PASSWORD);
    }

    @Test
    void loginRotatesSessionAndCsrfLogoutInvalidatesIdentity() throws Exception {
        var browser = new Browser();
        error(browser.get("/api/v1/orders"), 401, "AUTH_REQUIRED");
        var session = browser.get("/api/v1/auth/session");
        assertThat(session.headers().firstValue("Cache-Control")).contains("no-store");
        String oldCookie = browser.cookies.getCookieStore().getCookies().getFirst().getValue();
        String oldCsrf = browser.csrf;
        error(browser.post("/api/v1/auth/login", "{}", null), 403, "CSRF_INVALID");
        error(browser.post("/api/v1/auth/login", "{\"username\":\"unknown\",\"password\":\"wrong\"}"), 401, "INVALID_CREDENTIALS");
        browser.login(alice);
        assertThat(browser.csrf).isNotEqualTo(oldCsrf);
        assertThat(browser.cookies.getCookieStore().getCookies().getFirst().getValue()).isNotEqualTo(oldCookie);
        error(browser.post("/api/v1/orders", payload(1, "old-token-key"), oldCsrf), 403, "CSRF_INVALID");
        String signedInCsrf = browser.csrf;
        var logout = browser.post("/api/v1/auth/logout", "{}");
        assertThat(logout.statusCode()).isEqualTo(200);
        assertThat(body(logout).get("user").isNull()).isTrue();
        browser.csrf = body(logout).get("csrfToken").asString();
        assertThat(browser.csrf).isNotEqualTo(signedInCsrf);
        error(browser.post("/api/v1/orders", payload(1, "anonymous-key")), 401, "AUTH_REQUIRED");
    }

    @Test
    void sessionCookieIsHttpOnlyAndStrict() throws Exception {
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/v1/auth/session")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.headers().firstValue("Set-Cookie").orElseThrow()).contains("HttpOnly", "SameSite=Strict");
        assertThat(body(response).get("user").isNull()).isTrue();
    }

    @Test
    void ownershipComesOnlyFromSessionAndPreventsCrossUserReadsAndPayment() throws Exception {
        var a = new Browser().login(alice);
        var b = new Browser().login(bob);
        var created = a.post("/api/v1/orders", payload(2, "owner-check-key").replace("}", ",\"userId\":999}"));
        assertThat(created.statusCode()).isEqualTo(200);
        assertThat(created.headers().firstValue("Cache-Control")).contains("no-store");
        long id = body(created).get("id").longValue();
        assertThat(admin.queryForObject("SELECT user_id FROM commerce_order WHERE id=?", Long.class, id)).isEqualTo(aliceId);
        assertThat(body(a.get("/api/v1/orders")).size()).isEqualTo(1);
        assertThat(body(b.get("/api/v1/orders")).size()).isZero();
        error(b.get("/api/v1/orders/" + id), 403, "ORDER_FORBIDDEN");
        error(b.post("/api/v1/orders/" + id + "/pay", "{}"), 403, "ORDER_FORBIDDEN");
        assertThat(body(a.get("/api/v1/orders/" + id))).isEqualTo(body(created));
    }

    @Test
    void moneyIsExactStringAndPaymentIsRepeatableWithoutMoreStockChanges() throws Exception {
        var browser = new Browser().login(alice);
        var created = browser.post("/api/v1/orders", payload(3, "exact-money-key"));
        assertThat(created.statusCode()).isEqualTo(200);
        var order = body(created);
        assertThat(order.size()).isEqualTo(9);
        assertThat(order.get("unitPrice").isString()).isTrue();
        assertThat(order.get("unitPrice").asString()).isEqualTo("129.90");
        assertThat(order.get("totalAmount").asString()).isEqualTo("389.70");
        assertThat(order.get("currency").asString()).isEqualTo("CNY");
        assertThat(order.get("status").asString()).isEqualTo("PENDING_PAYMENT");
        String path = "/api/v1/orders/" + order.get("id").longValue() + "/pay";
        var first = browser.post(path, "{}");
        var second = browser.post(path, "{}");
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(body(first).get("status").asString()).isEqualTo("PAID");
        assertThat(body(second)).isEqualTo(body(first));
        assertThat(stock()).isEqualTo(7);
    }

    List<HttpResponse<String>> concurrent(Browser browser, boolean sameKey) throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var ready = new CountDownLatch(20);
            var start = new CountDownLatch(1);
            List<Future<HttpResponse<String>>> futures = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                final String key = sameKey ? "concurrent-same-key" : "concurrent-key-" + i;
                futures.add(executor.submit(() -> {
                    ready.countDown(); start.await();
                    return browser.post("/api/v1/orders", payload(1, key));
                }));
            }
            ready.await(); start.countDown();
            var results = new ArrayList<HttpResponse<String>>();
            for (var future : futures) results.add(future.get());
            return results;
        }
    }

    @Test
    void twentyConcurrentOrdersAgainstTenStockNeverOversell() throws Exception {
        var results = concurrent(new Browser().login(alice), false);
        assertThat(results.stream().filter(r -> r.statusCode() == 200).count()).isEqualTo(10);
        assertThat(results.stream().filter(r -> r.statusCode() == 409).count()).isEqualTo(10);
        for (var response : results) if (response.statusCode() != 200) error(response, 409, "INSUFFICIENT_STOCK");
        assertThat(stock()).isZero();
        assertThat(orders()).isEqualTo(10);
    }

    @Test
    void twentySameKeyRetriesReturnOneOrderAndDeductOnce() throws Exception {
        var results = concurrent(new Browser().login(alice), true);
        assertThat(results).allSatisfy(r -> assertThat(r.statusCode()).isEqualTo(200));
        assertThat(results.stream().map(r -> body(r).get("id").longValue()).distinct().count()).isEqualTo(1);
        assertThat(stock()).isEqualTo(9);
        assertThat(orders()).isEqualTo(1);
    }

    @Test
    void existingKeyWithChangedQuantityOrProductReturnsConflict() throws Exception {
        var browser = new Browser().login(alice);
        assertThat(browser.post("/api/v1/orders", payload(1, "changed-payload-key")).statusCode()).isEqualTo(200);
        error(browser.post("/api/v1/orders", payload(2, "changed-payload-key")), 409, "IDEMPOTENCY_CONFLICT");
        error(browser.post("/api/v1/orders", payload(1, "changed-payload-key").replace(Long.toString(productId), "9223372036854775807")),
                409, "IDEMPOTENCY_CONFLICT");
        assertThat(stock()).isEqualTo(9);
    }

    @Test
    void shortageRollsBackTheInsertedOrder() throws Exception {
        var browser = new Browser().login(alice);
        error(browser.post("/api/v1/orders", payload(11, "shortage-rollback-key")), 409, "INSUFFICIENT_STOCK");
        assertThat(orders()).isZero();
        assertThat(stock()).isEqualTo(10);
        assertThat(browser.post("/api/v1/orders", payload(1, "shortage-rollback-key")).statusCode()).isEqualTo(200);
    }

    @Test
    void failureAfterSuccessfulStockUpdateRollsBackBothTables() throws Exception {
        var browser = new Browser().login(alice);
        FAIL_AFTER_DEDUCTION.set(true);
        error(browser.post("/api/v1/orders", payload(2, "injected-rollback-key")), 500, "INTERNAL_ERROR");
        assertThat(FAIL_AFTER_DEDUCTION).isFalse();
        assertThat(orders()).isZero();
        assertThat(stock()).isEqualTo(10);
        assertThat(browser.post("/api/v1/orders", payload(2, "injected-rollback-key")).statusCode()).isEqualTo(200);
        assertThat(stock()).isEqualTo(8);
    }

    @Test
    void malformedAndInvalidBodiesAreSafeAndMissingResourcesAreExplicit() throws Exception {
        var browser = new Browser().login(alice);
        for (String input : new String[]{"{", "{}", payload(0, "invalid-quantity-key"),
                payload(101, "invalid-quantity-key"), payload(1, "short"), "null",
                payload(1, "fractional-qty-key").replace("\"quantity\":1", "\"quantity\":1.9"),
                payload(1, "fractional-id-key").replace(Long.toString(productId), productId + ".5")}) {
            error(browser.post("/api/v1/orders", input), 400, "INVALID_ARGUMENT");
        }
        error(browser.post("/api/v1/orders", payload(1, "missing-product-key").replace(Long.toString(productId), "9223372036854775807")),
                404, "PRODUCT_NOT_FOUND");
        error(browser.get("/api/v1/orders/9223372036854775807"), 404, "ORDER_NOT_FOUND");
        error(browser.post("/api/v1/orders/9223372036854775807/pay", "{}"), 404, "ORDER_NOT_FOUND");
        error(browser.post("/api/v1/orders/9223372036854775807/pay", "{"), 400, "INVALID_ARGUMENT");
        error(browser.post("/api/v1/auth/logout", "{"), 400, "INVALID_ARGUMENT");
        assertThat(stock()).isEqualTo(10);
    }

    @Test
    void appUsesRestrictedWriterAndCannotDelete() {
        assertThat(app.queryForObject("SELECT CURRENT_USER()", String.class)).startsWith("commerce_writer@");
        assertThatThrownBy(() -> app.update("DELETE FROM commerce_order WHERE id=-1")).isInstanceOf(DataAccessException.class);
        var grants = app.queryForList("SHOW GRANTS", String.class);
        assertThat(String.join("\n", grants)).doesNotContain("ALL PRIVILEGES", "DELETE", "DROP", "CREATE", "GRANT OPTION");
        assertThat(admin.queryForObject("SELECT available_stock FROM inventory WHERE product_id=1", Integer.class)).isEqualTo(10);
    }
}
