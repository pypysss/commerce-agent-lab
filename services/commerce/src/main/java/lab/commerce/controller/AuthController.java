package lab.commerce.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lab.commerce.config.SessionAccess;
import lab.commerce.service.AuthService;
import lab.commerce.vo.SessionView;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService service;
    private final SessionAccess sessions;

    public record LoginRequest(@NotBlank @Size(max = 64) String username,
            @NotBlank @Size(max = 128) String password) {}
    public record LogoutRequest() {}

    @GetMapping("/session")
    public SessionView session(HttpServletRequest request) {
        return sessions.view(request.getSession(true));
    }

    @PostMapping("/login")
    public SessionView login(@Valid @RequestBody LoginRequest input, HttpServletRequest request) {
        var user = service.login(input.username(), input.password());
        var session = request.getSession(true);
        request.changeSessionId();
        sessions.signIn(session, user);
        return sessions.view(session);
    }

    @PostMapping("/logout")
    public SessionView logout(@RequestBody(required = false) LogoutRequest input, HttpServletRequest request) {
        request.getSession().invalidate();
        return sessions.view(request.getSession(true));
    }
}
