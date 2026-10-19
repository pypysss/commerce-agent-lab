package lab.commerce.service;

import java.util.List;
import lab.commerce.vo.OrderView;

public interface OrderService {
    List<OrderView> list(long userId);
    OrderView detail(long userId, long id);
    OrderView create(long userId, long productId, int quantity, String requestKey);
    OrderView pay(long userId, long id);
}
