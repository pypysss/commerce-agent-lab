package lab.commerce.exception;

/** A closed set of safe business failures; never constructed from an SQL/driver message. */
public class OrderAccessException extends RuntimeException {
    public enum Reason {
        AUTH_REQUIRED, INVALID_CREDENTIALS, CSRF_INVALID, ORDER_NOT_FOUND,
        ORDER_FORBIDDEN, INSUFFICIENT_STOCK, IDEMPOTENCY_CONFLICT
    }

    private final Reason reason;

    public OrderAccessException(Reason reason) {
        super(reason.name());
        this.reason = reason;
    }

    public Reason reason() { return reason; }
}
