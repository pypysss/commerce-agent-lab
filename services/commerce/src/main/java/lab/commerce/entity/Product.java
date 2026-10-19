package lab.commerce.entity;

import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Maps only the product table; inventory belongs to a separate table. */
@Getter
@Setter
@NoArgsConstructor
public class Product {
    private long id;
    private String sku;
    private String name;
    private String description;
    private BigDecimal price;
    private String status;

}
