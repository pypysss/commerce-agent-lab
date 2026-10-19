package lab.commerce.exception;

import java.sql.SQLException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    public record ApiError(String code, String message) {
    }

    @ExceptionHandler(OrderAccessException.class)
    ResponseEntity<ApiError> orderAccess(OrderAccessException exception) {
        return switch (exception.reason()) {
            case AUTH_REQUIRED -> error(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请先登录");
            case INVALID_CREDENTIALS -> error(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "用户名或密码错误");
            case CSRF_INVALID -> error(HttpStatus.FORBIDDEN, "CSRF_INVALID", "会话校验失败，请刷新后重试");
            case ORDER_NOT_FOUND -> error(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "订单不存在");
            case ORDER_FORBIDDEN -> error(HttpStatus.FORBIDDEN, "ORDER_FORBIDDEN", "无权访问该订单");
            case INSUFFICIENT_STOCK -> error(HttpStatus.CONFLICT, "INSUFFICIENT_STOCK", "库存不足");
            case IDEMPOTENCY_CONFLICT -> error(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "请求标识已用于不同的下单参数");
        };
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    ResponseEntity<ApiError> invalidBody(Exception exception) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "请求参数无效，请检查后重试");
    }

    @ExceptionHandler(ProductNotFoundException.class)
    ResponseEntity<ApiError> notFound(ProductNotFoundException exception) {
        return error(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "商品不存在或未上架");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> invalidArgument(IllegalArgumentException exception) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "参数必须为整数且在有效范围内");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> invalidType(MethodArgumentTypeMismatchException exception) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "参数必须为整数且在有效范围内");
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiError> invalidConstraint(HandlerMethodValidationException exception) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", "参数必须为整数且在有效范围内");
    }

    @ExceptionHandler({DataAccessResourceFailureException.class,
            TransientDataAccessResourceException.class, CannotCreateTransactionException.class})
    ResponseEntity<ApiError> databaseUnavailable(RuntimeException exception) {
        logDatabaseFailure(exception, true);
        return error(HttpStatus.SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据服务暂不可用，请稍后重试");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<ApiError> databaseOperationFailed(DataAccessException exception) {
        // A bad statement or mapping is a server error; retrying is not a recovery plan.
        logDatabaseFailure(exception, false);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务内部错误，请稍后联系维护人员");
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String code, String message) {
        // Keep a safe fallback for direct API users; the frontend translates the stable code.
        return ResponseEntity.status(status).body(new ApiError(code, message));
    }

    private static void logDatabaseFailure(RuntimeException exception, boolean unavailable) {
        var rootCause = NestedExceptionUtils.getMostSpecificCause(exception);
        String sqlState = rootCause instanceof SQLException sql ? sql.getSQLState() : null;
        Integer vendorCode = rootCause instanceof SQLException sql ? sql.getErrorCode() : null;
        // Messages and stack traces may contain SQL, JDBC URLs or credentials; log metadata only.
        var event = unavailable ? log.atWarn() : log.atError();
        event.log("Database failure: type={}, rootCause={}, sqlState={}, vendorCode={}",
                exception.getClass().getSimpleName(), rootCause.getClass().getSimpleName(), sqlState, vendorCode);
    }
}

