package lab.commerce.exception;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void hidesDriverSqlAndCredentialsInDatabaseFailure() {
        var response = handler.databaseUnavailable(
                new DataAccessResourceFailureException("SELECT secret FROM product jdbc:mysql://private password=hidden"));
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().code()).isEqualTo("DATABASE_UNAVAILABLE");
        assertThat(response.getBody().message()).doesNotContain("SELECT", "jdbc", "password", "hidden");
    }

    @Test
    void mapsTransactionConnectionFailureToTheSameSafe503() {
        var response = handler.databaseUnavailable(
                new CannotCreateTransactionException("Cannot get JDBC connection"));
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().code()).isEqualTo("DATABASE_UNAVAILABLE");
    }

    @Test
    void mapsTransientResourceFailureToTheSameSafe503() {
        var response = handler.databaseUnavailable(
                new TransientDataAccessResourceException("Connection is temporarily unavailable"));
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().code()).isEqualTo("DATABASE_UNAVAILABLE");
    }

    @Test
    void mapsBadSqlToSafe500AndLogsOnlyDiagnosticMetadata() {
        var logger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        try {
            var response = handler.databaseOperationFailed(new BadSqlGrammarException(
                    "load product", "SELECT secret FROM product",
                    new SQLException("jdbc:mysql://private password=hidden", "42000", 1064)));
            assertThat(response.getStatusCode().value()).isEqualTo(500);
            assertThat(response.getBody().code()).isEqualTo("INTERNAL_ERROR");
            assertThat(response.getBody().message()).doesNotContain("SELECT", "jdbc", "password", "hidden");
            assertThat(appender.list).hasSize(1);
            assertThat(appender.list.getFirst().getFormattedMessage())
                    .contains("BadSqlGrammarException", "SQLException", "42000", "1064")
                    .doesNotContain("SELECT", "jdbc", "password", "hidden");
            assertThat(appender.list.getFirst().getThrowableProxy()).isNull();
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void mapsOtherDataAccessFailureToSafe500() {
        var response = handler.databaseOperationFailed(
                new DataIntegrityViolationException("SQL constraint internal details"));
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody().code()).isEqualTo("INTERNAL_ERROR");
        assertThat(response.getBody().message()).doesNotContain("SQL", "constraint");
    }

    @Test
    void returnsStableCodesAndFixedSafeFallbackMessagesWithoutLanguageHeaders() {
        var missing = handler.notFound(new ProductNotFoundException());
        assertThat(missing.getStatusCode().value()).isEqualTo(404);
        assertThat(missing.getBody()).isEqualTo(
                new GlobalExceptionHandler.ApiError("PRODUCT_NOT_FOUND", "商品不存在或未上架"));

        var argument = handler.invalidArgument(
                new IllegalArgumentException("SELECT private jdbc:mysql://secret password=hidden"));
        assertThat(argument.getStatusCode().value()).isEqualTo(400);
        assertThat(argument.getBody()).isEqualTo(
                new GlobalExceptionHandler.ApiError("INVALID_ARGUMENT", "参数必须为整数且在有效范围内"));

        var mismatch = handler.invalidType(new MethodArgumentTypeMismatchException(
                "not-a-number", Integer.class, "page", null, new NumberFormatException("hidden")));
        assertThat(mismatch.getStatusCode().value()).isEqualTo(400);
        assertThat(mismatch.getBody()).isEqualTo(argument.getBody());

        var database = handler.databaseUnavailable(
                new DataAccessResourceFailureException("SELECT private jdbc:mysql://secret password=hidden"));
        assertThat(database.getStatusCode().value()).isEqualTo(503);
        assertThat(database.getBody()).isEqualTo(
                new GlobalExceptionHandler.ApiError("DATABASE_UNAVAILABLE", "数据服务暂不可用，请稍后重试"));

        var failure = handler.databaseOperationFailed(
                new DataIntegrityViolationException("SELECT private jdbc:mysql://secret password=hidden"));
        assertThat(failure.getStatusCode().value()).isEqualTo(500);
        assertThat(failure.getBody()).isEqualTo(
                new GlobalExceptionHandler.ApiError("INTERNAL_ERROR", "服务内部错误，请稍后联系维护人员"));

        for (var response : java.util.List.of(missing, argument, mismatch, database, failure)) {
            assertThat(response.getHeaders().getContentLanguage()).isNull();
            assertThat(response.getHeaders().getVary()).doesNotContain("Accept-Language");
            assertThat(response.getBody().message()).doesNotContain("SELECT", "jdbc", "password", "hidden");
        }
    }
}

