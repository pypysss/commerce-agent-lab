-- Additive migration. Setup administrator runs DDL; application never does.
USE commerce;
CREATE TABLE IF NOT EXISTS lab_user (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_lab_user_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commerce_order (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    product_name VARCHAR(120) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_amount DECIMAL(16,2) NOT NULL,
    request_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_PAYMENT',
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_user_request (user_id, request_key),
    KEY idx_order_user_id (user_id, id),
    CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES lab_user(id),
    CONSTRAINT fk_order_product FOREIGN KEY (product_id) REFERENCES product(id),
    CONSTRAINT chk_order_quantity CHECK (quantity BETWEEN 1 AND 100),
    CONSTRAINT chk_order_money CHECK (unit_price >= 0 AND total_amount = unit_price * quantity),
    CONSTRAINT chk_order_status CHECK (status IN ('PENDING_PAYMENT','PAID'))
) ENGINE=InnoDB;
