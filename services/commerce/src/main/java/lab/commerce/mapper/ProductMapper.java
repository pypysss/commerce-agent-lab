package lab.commerce.mapper;

import java.util.List;
import lab.commerce.dto.ProductStockRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL and explicit result mappings live in resources/mapper/ProductMapper.xml. */
@Mapper
public interface ProductMapper {
    List<ProductStockRow> findPage(@Param("limit") int limit, @Param("offset") int offset);

    ProductStockRow findById(@Param("id") long id);

    long countActive();
}
