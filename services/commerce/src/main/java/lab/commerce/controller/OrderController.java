package lab.commerce.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.util.List;
import lab.commerce.config.SessionAccess;
import lab.commerce.service.OrderService;
import lab.commerce.vo.OrderView;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService service;
    private final SessionAccess sessions;

    public record CreateRequest(@Positive long productId, @Min(1) @Max(100) int quantity,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{8,80}") String requestKey) {}
    public record PayRequest() {}

    @GetMapping
    public List<OrderView> list(HttpServletRequest request) {
        return service.list(sessions.requireUser(request));
    }

    @GetMapping("/{id}")
    public OrderView detail(@PathVariable @Positive long id, HttpServletRequest request) {
        return service.detail(sessions.requireUser(request), id);
    }

    @PostMapping
    public OrderView create(@Valid @RequestBody CreateRequest input, HttpServletRequest request) {
        return service.create(sessions.requireUser(request), input.productId(), input.quantity(), input.requestKey());
    }

    @PostMapping("/{id}/pay")
    public OrderView pay(@PathVariable @Positive long id, @RequestBody PayRequest input, HttpServletRequest request) {
        return service.pay(sessions.requireUser(request), id);
    }
}
