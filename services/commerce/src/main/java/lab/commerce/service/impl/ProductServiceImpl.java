package lab.commerce.service.impl;

import lab.commerce.exception.ProductNotFoundException;
import lab.commerce.mapper.ProductMapper;
import lab.commerce.service.ProductService;
import lab.commerce.vo.ProductPage;
import lab.commerce.vo.ProductView;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProductServiceImpl implements ProductService {
    private final ProductMapper mapper;

    @Override
    @Transactional(readOnly = true)
    public ProductPage list(int page, int size) {
        if (page < 1 || page > 100_000 || size < 1 || size > 100) {
            throw new IllegalArgumentException("page 必须在 1..100000，size 必须在 1..100");
        }
        int offset = (page - 1) * size;
        long total = mapper.countActive();
        var items = mapper.findPage(size, offset).stream().map(ProductView::from).toList();
        return new ProductPage(items, page, size, total);
    }

    @Override
    @Transactional(readOnly = true)
    public ProductView detail(long id) {
        if (id < 1) {
            throw new IllegalArgumentException("商品 ID 必须为正整数");
        }
        var row = mapper.findById(id);
        if (row == null) {
            throw new ProductNotFoundException();
        }
        return ProductView.from(row);
    }
}
