package lab.commerce.service;

import lab.commerce.vo.ProductPage;
import lab.commerce.vo.ProductView;

public interface ProductService {
    ProductPage list(int page, int size);

    ProductView detail(long id);
}
