package lab.commerce.dto;

import lab.commerce.entity.Product;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Internal result of joining product and inventory; not the HTTP response. */
@Getter
@Setter
@NoArgsConstructor
public class ProductStockRow {
    // Identity of this joined row; ProductView controls the separate HTTP response.
    private long productId;
    private Product product;
    private int availableStock;

}
