package lab.commerce.service.impl;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import lab.commerce.entity.CommerceOrder;
import lab.commerce.exception.OrderAccessException;
import lab.commerce.exception.ProductNotFoundException;
import lab.commerce.mapper.OrderMapper;
import lab.commerce.mapper.ProductMapper;
import lab.commerce.service.OrderService;
import lab.commerce.vo.OrderView;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

import static lab.commerce.exception.OrderAccessException.Reason.*;

@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {
    private final OrderMapper mapper;
    private final ProductMapper products;

    @Override
    @Transactional(readOnly = true)
    public List<OrderView> list(long userId) {
        return mapper.findForUser(userId).stream().map(OrderView::from).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public OrderView detail(long userId, long id) {
        return OrderView.from(owned(userId, id));
    }

    private CommerceOrder owned(long userId, long id) {
        var order = mapper.findById(id);
        if (order == null) throw new OrderAccessException(ORDER_NOT_FOUND);
        if (order.getUserId() != userId) throw new OrderAccessException(ORDER_FORBIDDEN);
        return order;
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public OrderView create(long userId, long productId, int quantity, String requestKey) {
        if (productId < 1 || quantity < 1 || quantity > 100 || requestKey == null
                || !requestKey.matches("[A-Za-z0-9_-]{8,80}")) throw new IllegalArgumentException();
        var previous = mapper.findByRequestKey(userId, requestKey);
        if (previous != null) return repeated(previous, productId, quantity);
        var product = products.findById(productId);
        if (product == null) throw new ProductNotFoundException();
        var order = new CommerceOrder();
        order.setUserId(userId);
        order.setProductId(productId);
        order.setProductName(product.getProduct().getName());
        order.setQuantity(quantity);
        order.setUnitPrice(product.getProduct().getPrice());
        order.setTotalAmount(order.getUnitPrice().multiply(BigDecimal.valueOf(quantity)));
        order.setRequestKey(requestKey);
        order.setStatus("PENDING_PAYMENT");
        order.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC).withNano(0));
        try {
            // The unique key serializes concurrent retries BEFORE any inventory deduction.
            mapper.insert(order);
        } catch (DuplicateKeyException exception) {
            // InnoDB rolls back the failed statement only. READ_COMMITTED gives this
            // SELECT a fresh snapshot after the winner commits, without lock upgrades.
            var existing = mapper.findByRequestKey(userId, requestKey);
            if (existing == null) throw exception;
            return repeated(existing, productId, quantity);
        }
        if (mapper.deductStock(productId, quantity) != 1) {
            // Runtime exception also rolls back the just-inserted order.
            throw new OrderAccessException(INSUFFICIENT_STOCK);
        }
        return OrderView.from(order);
    }

    private OrderView repeated(CommerceOrder existing, long productId, int quantity) {
        if (existing.getProductId() != productId || existing.getQuantity() != quantity) {
            throw new OrderAccessException(IDEMPOTENCY_CONFLICT);
        }
        return OrderView.from(existing);
    }

    @Override
    @Transactional
    public OrderView pay(long userId, long id) {
        var order = mapper.findByIdForUpdate(id);
        if (order == null) throw new OrderAccessException(ORDER_NOT_FOUND);
        if (order.getUserId() != userId) throw new OrderAccessException(ORDER_FORBIDDEN);
        // Conditional transition is idempotent; no money moves in this learning simulation.
        mapper.markPaid(id, userId);
        order.setStatus("PAID");
        return OrderView.from(order);
    }
}
