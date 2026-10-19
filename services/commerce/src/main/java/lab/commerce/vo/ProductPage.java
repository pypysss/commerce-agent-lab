package lab.commerce.vo;

import java.util.List;

public record ProductPage(List<ProductView> items, int page, int size, long total) {
}
