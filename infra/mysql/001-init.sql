-- Run as a setup administrator. The Java application's account has SELECT only.
CREATE DATABASE IF NOT EXISTS commerce CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE commerce;

CREATE TABLE IF NOT EXISTS product (
    id BIGINT NOT NULL,
    sku VARCHAR(64) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (id),
    UNIQUE KEY uk_product_sku (sku),
    KEY idx_product_status_id (status, id),
    CONSTRAINT chk_product_price CHECK (price >= 0),
    CONSTRAINT chk_product_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory (
    product_id BIGINT NOT NULL,
    available_stock INT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id),
    CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES product(id),
    CONSTRAINT chk_inventory_stock CHECK (available_stock >= 0)
) ENGINE=InnoDB;

-- Repeated execution fills gaps without resetting existing records or stock.
INSERT IGNORE INTO product (id, sku, name, description, price, status) VALUES
    (1, 'COURSE-001', 'Java 并发学习手册', '从线程安全到线程池，用可运行示例理解 JUC。', 129.90, 'ACTIVE'),
    (2, 'TOOL-002', '开发者桌面工具包', '用于练习商品查询与后续订单、库存业务。', 59.00, 'ACTIVE'),
    (3, 'GUIDE-003', 'RAG 实践指南', '知识检索与引用的入门材料，目前暂时缺货。', 19.90, 'ACTIVE');

INSERT IGNORE INTO inventory (product_id, available_stock, version) VALUES
    (1, 10, 0), (2, 25, 0), (3, 0, 0);

