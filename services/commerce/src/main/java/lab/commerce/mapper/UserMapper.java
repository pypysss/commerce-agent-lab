package lab.commerce.mapper;

import lab.commerce.entity.LabUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper {
    LabUser findByUsername(@Param("username") String username);
}
