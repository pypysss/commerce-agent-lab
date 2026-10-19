package lab.commerce.mapper;

import java.util.List;
import lab.commerce.entity.CommerceOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OrderMapper {
    List<CommerceOrder> findForUser(@Param("userId") long userId);
    CommerceOrder findById(@Param("id") long id);
    CommerceOrder findByIdForUpdate(@Param("id") long id);
    CommerceOrder findByRequestKey(@Param("userId") long userId, @Param("requestKey") String requestKey);
    int insert(CommerceOrder order);
    int deductStock(@Param("productId") long productId, @Param("quantity") int quantity);
    int markPaid(@Param("id") long id, @Param("userId") long userId);
}
