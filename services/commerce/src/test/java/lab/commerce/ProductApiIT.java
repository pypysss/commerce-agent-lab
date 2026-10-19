package lab.commerce;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import lab.commerce.dto.ProductStockRow;
import lab.commerce.mapper.ProductMapper;
import org.apache.ibatis.builder.StaticSqlSource;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionTemplate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.support.DirtiesContextTestExecutionListener;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// This integration test has real beans only: no Mockito reset listener or runtime Agent is needed.
@TestExecutionListeners(listeners = {DependencyInjectionTestExecutionListener.class,
        DirtiesContextTestExecutionListener.class}, mergeMode = TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ProductApiIT {
    @Value("${local.server.port}")
    int port;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ProductMapper mapper;

    @Autowired
    SqlSessionFactory sqlSessionFactory;

    @Autowired
    SqlSessionTemplate sqlSessionTemplate;

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final JsonMapper json = JsonMapper.builder().build();

    HttpResponse<String> get(String path) throws Exception {
        return get(path, null);
    }

    HttpResponse<String> get(String path, String acceptLanguage) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(8));
        if (acceptLanguage != null) {
            request.header("Accept-Language", acceptLanguage);
        }
        return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    JsonNode body(HttpResponse<String> response) {
        return json.readTree(response.body());
    }

    @Test
    void usesRealMySqlAndReadsExactDecimalFromDatabase() throws Exception {
        try (var connection = jdbc.getDataSource().getConnection()) {
            assertThat(connection.getMetaData().getDatabaseProductName()).isEqualTo("MySQL");
        }
        assertThat(jdbc.queryForObject("SELECT price FROM product WHERE id = 1", BigDecimal.class))
                .isEqualTo(new BigDecimal("129.90"));
    }

    @Test
    void listTraversesHttpControllerServiceMapperAndDatabase() throws Exception {
        var response = get("/api/v1/products?page=1&size=2");
        assertThat(response.statusCode()).isEqualTo(200);
        var value = body(response);
        assertThat(value.get("items").size()).isEqualTo(2);
        assertThat(value.get("page").intValue()).isEqualTo(1);
        assertThat(value.get("size").intValue()).isEqualTo(2);
        assertThat(value.get("total").longValue()).isGreaterThanOrEqualTo(3);
        assertThat(value.get("items").get(0).get("price").isString()).isTrue();
        assertThat(value.get("items").get(0).get("price").asString()).isEqualTo("129.90");
        assertThat(value.get("items").get(0).get("name").asString()).isEqualTo("Java 并发学习手册");
        for (String internalField : new String[]{"productId", "product", "status"}) {
            assertThat(value.get("items").get(0).has(internalField)).as(internalField).isFalse();
        }
    }

    @Test
    void detailPreservesZeroStock() throws Exception {
        var response = get("/api/v1/products/3");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(body(response).get("availableStock").intValue()).isZero();
        assertThat(body(response).get("sku").asString()).isEqualTo("GUIDE-003");
    }

    @Test
    void emptyPageIsAValidResult() throws Exception {
        var response = get("/api/v1/products?page=100000&size=100");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(body(response).get("items").size()).isZero();
        assertThat(body(response).get("total").longValue()).isGreaterThanOrEqualTo(3);
    }

    @Test
    void missingProductReturnsStable404() throws Exception {
        var response = get("/api/v1/products/9223372036854775807");
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(body(response).get("code").asString()).isEqualTo("PRODUCT_NOT_FOUND");
    }

    @Test
    void invalidPaginationAndNonNumericIdReturn400() throws Exception {
        for (String path : new String[]{"/api/v1/products?page=0", "/api/v1/products?page=100001",
                "/api/v1/products?size=0", "/api/v1/products?size=101",
                "/api/v1/products?page=2147483648", "/api/v1/products/abc",
                "/api/v1/products/0", "/api/v1/products/-1"}) {
            var response = get(path);
            assertThat(response.statusCode()).as(path).isEqualTo(400);
            assertThat(body(response).get("code").asString()).isEqualTo("INVALID_ARGUMENT");
            // MVC constraints reject the request before Service's own defensive checks.
            assertThat(body(response).get("message").asString()).isEqualTo("参数必须为整数且在有效范围内");
        }
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"zh-CN", "en", "en-US", "ja", "ja-JP", "fr-FR",
            "fr-FR, ja-JP;q=0.9, en;q=0.8"})
    void acceptLanguageDoesNotChangePublicErrorsThroughActualHttp(String acceptLanguage) throws Exception {
        var response = get("/api/v1/products/9223372036854775807", acceptLanguage);
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(body(response).get("code").asString()).isEqualTo("PRODUCT_NOT_FOUND");
        assertThat(body(response).get("message").asString()).isEqualTo("商品不存在或未上架");
        assertNoLanguageNegotiationHeaders(response);

        for (String path : new String[]{"/api/v1/products?page=0", "/api/v1/products?page=abc",
                "/api/v1/products/0", "/api/v1/products/abc"}) {
            var invalid = get(path, acceptLanguage);
            assertThat(invalid.statusCode()).as(path).isEqualTo(400);
            assertThat(body(invalid).get("code").asString()).isEqualTo("INVALID_ARGUMENT");
            assertThat(body(invalid).get("message").asString()).isEqualTo("参数必须为整数且在有效范围内");
            assertNoLanguageNegotiationHeaders(invalid);
        }
    }

    private void assertNoLanguageNegotiationHeaders(HttpResponse<String> response) {
        assertThat(response.headers().firstValue("Content-Language")).isEmpty();
        assertThat(response.headers().allValues("Vary")).noneSatisfy(value ->
                assertThat(value).containsIgnoringCase("Accept-Language"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"zh-CN", "en", "ja"})
    void languageHeadersDoNotAffectProductDataOrMoney(String language) throws Exception {
        for (String path : new String[]{"/api/v1/products?page=1&size=2", "/api/v1/products/1"}) {
            var original = get(path);
            var localized = get(path, language);
            assertThat(localized.statusCode()).isEqualTo(200);
            assertThat(body(localized)).as(path).isEqualTo(body(original));
        }
    }

    @Test
    void mapperStatementsComeFromXmlResources() {
        var configuration = sqlSessionFactory.getConfiguration();
        for (String method : new String[]{"findPage", "findById", "countActive"}) {
            var statement = configuration.getMappedStatement(ProductMapper.class.getName() + "." + method);
            assertThat(statement.getResource().replace('\\', '/'))
                    .as("SQL source of %s", method).contains("mapper/ProductMapper.xml");
        }
        // Nested result maps need root identity to keep equal-stock products separate.
        assertThat(configuration.getResultMap(ProductMapper.class.getName() + ".ProductStockRowMap")
                .getIdResultMappings()).extracting(mapping -> mapping.getColumn())
                .containsExactly("product_id");
    }

    @Test
    void xmlAssociationMapsTableEntityAndJoinedStock() {
        var first = mapper.findById(1L);
        assertThat(first).isNotNull();
        assertThat(first.getProduct()).isNotNull();
        assertThat(first.getProductId()).isEqualTo(first.getProduct().getId());
        assertThat(first.getProduct().getId()).isEqualTo(1L);
        assertThat(first.getProduct().getSku()).isEqualTo("COURSE-001");
        assertThat(first.getProduct().getName()).isEqualTo("Java 并发学习手册");
        assertThat(first.getProduct().getStatus()).isEqualTo("ACTIVE");
        assertThat(first.getProduct().getPrice()).isEqualTo(new BigDecimal("129.90"));
        assertThat(first.getAvailableStock()).isEqualTo(10);

        var zeroStock = mapper.findById(3L);
        assertThat(zeroStock.getProduct().getStatus()).isEqualTo("ACTIVE");
        assertThat(zeroStock.getAvailableStock()).isZero();
        assertThat(mapper.findPage(2, 0)).hasSize(2)
                .allSatisfy(row -> assertThat(row.getProduct().getStatus()).isEqualTo("ACTIVE"));
        assertThat(mapper.findPage(3, 0)).extracting(row -> row.getProduct().getId())
                .containsExactly(1L, 2L, 3L);
        assertThat(mapper.countActive()).isGreaterThanOrEqualTo(3);
    }

    @Test
    void xmlRowIdentityKeepsEqualStockProductsSeparate() {
        var configuration = sqlSessionFactory.getConfiguration();
        String statementId = ProductApiIT.class.getName() + ".equalStockFixture";
        // Read real MySQL rows with equal stock, reusing the production XML result map.
        String sql = """
                SELECT p.id AS product_id, p.sku AS product_sku, p.name AS product_name,
                       p.description AS product_description, p.price AS product_price,
                       p.status AS product_status, 0 AS available_stock
                FROM product p WHERE p.id IN (1, 2, 3) ORDER BY p.id
                """;
        configuration.addMappedStatement(new MappedStatement.Builder(configuration, statementId,
                new StaticSqlSource(configuration, sql), SqlCommandType.SELECT)
                .resultMaps(List.of(configuration.getResultMap(
                        ProductMapper.class.getName() + ".ProductStockRowMap"))).build());

        List<ProductStockRow> rows = sqlSessionTemplate.selectList(statementId);
        assertThat(rows).hasSize(3).allSatisfy(row -> {
            assertThat(row.getAvailableStock()).isZero();
            assertThat(row.getProductId()).isEqualTo(row.getProduct().getId());
        });
        assertThat(rows).extracting(ProductStockRow::getProductId).containsExactly(1L, 2L, 3L);
    }
}

