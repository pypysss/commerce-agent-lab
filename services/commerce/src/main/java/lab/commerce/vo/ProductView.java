package lab.commerce.vo;

import lab.commerce.dto.ProductStockRow;

/** A decimal string avoids accidental binary floating-point conversion in browsers. */
public record ProductView(long id, String sku, String name, String description,
                          String price, int availableStock) {
    public static ProductView from(ProductStockRow row) {
        var product = row.getProduct();
        return new ProductView(product.getId(), product.getSku(), product.getName(), product.getDescription(),
                product.getPrice().toPlainString(), row.getAvailableStock());
    }
}
