package lab.commerce.exception;

public class ProductNotFoundException extends RuntimeException {
    public ProductNotFoundException() {
        super("商品不存在或未上架");
    }
}

