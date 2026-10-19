package lab.commerce.vo;

import lab.commerce.entity.CommerceOrder;

public record OrderView(long id, long productId, String productName, int quantity,
        String unitPrice, String totalAmount, String currency, String status, String createdAt) {
    public static OrderView from(CommerceOrder order) {
        return new OrderView(order.getId(), order.getProductId(), order.getProductName(),
                order.getQuantity(), order.getUnitPrice().toPlainString(),
                order.getTotalAmount().toPlainString(), "CNY", order.getStatus(),
                order.getCreatedAt().toString() + "Z");
    }
}
