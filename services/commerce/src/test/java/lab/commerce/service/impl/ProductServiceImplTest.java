package lab.commerce.service.impl;

import java.math.BigDecimal;
import java.util.List;
import lab.commerce.dto.ProductStockRow;
import lab.commerce.entity.Product;
import lab.commerce.exception.ProductNotFoundException;
import lab.commerce.mapper.ProductMapper;
import lab.commerce.service.ProductService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductServiceImplTest {
    private FakeMapper mapper;
    private ProductService service;

    @BeforeEach
    void setUp() {
        mapper = new FakeMapper();
        service = new ProductServiceImpl(mapper);
    }

    @ParameterizedTest
    @CsvSource({"0,20", "-1,20", "100001,20", "1,0", "1,-1", "1,101"})
    void rejectsUnsafePaginationBeforeUsingDatabase(int page, int size) {
        assertThatThrownBy(() -> service.list(page, size))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(mapper.calls).isZero();
    }

    @Test
    void calculatesOffsetAndKeepsDecimalScaleAndChineseText() {
        var row = productStockRow(1, "COURSE-001", "Java 并发学习手册",
                "中文内容", new BigDecimal("129.90"), 10);
        mapper.total = 3;
        mapper.rows = List.of(row);

        var result = service.list(2, 1);

        assertThat(result.page()).isEqualTo(2);
        assertThat(result.size()).isEqualTo(1);
        assertThat(result.total()).isEqualTo(3);
        assertThat(result.items().getFirst().price()).isEqualTo("129.90");
        assertThat(result.items().getFirst().name()).isEqualTo("Java 并发学习手册");
        assertThat(mapper.lastLimit).isEqualTo(1);
        assertThat(mapper.lastOffset).isEqualTo(1);
    }

    @Test
    void returnsAnEmptyPageWithoutLosingTheTotal() {
        mapper.total = 3;

        var result = service.list(2, 20);

        assertThat(result.items()).isEmpty();
        assertThat(result.total()).isEqualTo(3);
    }

    @Test
    void maximumPageCannotOverflowOffset() {
        mapper.total = 3;
        service.list(100_000, 100);
        assertThat(mapper.lastLimit).isEqualTo(100);
        assertThat(mapper.lastOffset).isEqualTo(9_999_900);
    }

    @Test
    void missingOrInactiveProductIsNotFound() {
        assertThatThrownBy(() -> service.detail(999L))
                .isInstanceOf(ProductNotFoundException.class);
    }

    @Test
    void rejectsNonPositiveIdBeforeUsingDatabase() {
        assertThatThrownBy(() -> service.detail(0L)).isInstanceOf(IllegalArgumentException.class);
        assertThat(mapper.calls).isZero();
    }

    @Test
    void preservesZeroStockAndAvoidsScientificMoneyNotation() {
        var row = productStockRow(3, "GUIDE-003", "RAG 实践指南",
                "缺货商品仍可浏览", new BigDecimal("1E+3"), 0);
        mapper.detail = row;

        assertThat(service.detail(3L).price()).isEqualTo("1000");
        assertThat(service.detail(3L).availableStock()).isZero();
    }

    private static ProductStockRow productStockRow(long id, String sku, String name,
                                                   String description, BigDecimal price, int stock) {
        var product = new Product();
        product.setId(id);
        product.setSku(sku);
        product.setName(name);
        product.setDescription(description);
        product.setPrice(price);
        product.setStatus("ACTIVE");
        var row = new ProductStockRow();
        row.setProductId(id);
        row.setProduct(product);
        row.setAvailableStock(stock);
        return row;
    }

    // Only the unit-test dependency is replaced; mysql-it still exercises the real Mapper/JDBC/MySQL.
    private static class FakeMapper implements ProductMapper {
        long total;
        int calls;
        int lastLimit;
        int lastOffset;
        List<ProductStockRow> rows = List.of();
        ProductStockRow detail;
        public List<ProductStockRow> findPage(int limit, int offset) {
            calls++; lastLimit = limit; lastOffset = offset; return rows;
        }
        public ProductStockRow findById(long id) { calls++; return detail; }
        public long countActive() { calls++; return total; }
    }
}

