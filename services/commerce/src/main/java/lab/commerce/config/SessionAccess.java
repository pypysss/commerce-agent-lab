package lab.commerce.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import lab.commerce.exception.OrderAccessException;
import lab.commerce.vo.SessionView;
import lab.commerce.vo.SessionView.UserView;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import static lab.commerce.exception.OrderAccessException.Reason.AUTH_REQUIRED;
import static lab.commerce.exception.OrderAccessException.Reason.CSRF_INVALID;

@Component
public class SessionAccess implements HandlerInterceptor {
    private static final String STATE = SessionAccess.class.getName() + ".state";
    private static final String REQUEST_USER = SessionAccess.class.getName() + ".requestUser";
    private static final SecureRandom RANDOM = new SecureRandom();

    public SessionView view(HttpSession session) {
        synchronized (session) {
            var state = (SessionView) session.getAttribute(STATE);
            if (state == null) {
                state = new SessionView(null, newToken());
                session.setAttribute(STATE, state);
            }
            return state;
        }
    }

    public void signIn(HttpSession session, UserView user) {
        // Publish identity and token atomically; readers never pair two login generations.
        session.setAttribute(STATE, new SessionView(user, newToken()));
    }

    public long requireUser(HttpServletRequest request) {
        var user = (UserView) request.getAttribute(REQUEST_USER);
        if (user == null) throw new OrderAccessException(AUTH_REQUIRED);
        return user.id();
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String path = request.getRequestURI();
        if (path.startsWith("/api/v1/auth/") || path.equals("/api/v1/orders") || path.startsWith("/api/v1/orders/")) {
            response.setHeader("Cache-Control", "no-store");
        }
        var session = request.getSession(false);
        var state = session == null ? null : (SessionView) session.getAttribute(STATE);
        if (state != null && state.user() != null) request.setAttribute(REQUEST_USER, state.user());
        if (!"POST".equals(request.getMethod())) return true;
        String expected = state == null ? null : state.csrfToken();
        String actual = request.getHeader("X-CSRF-Token");
        if (expected == null || actual == null || !MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8))) {
            throw new OrderAccessException(CSRF_INVALID);
        }
        return true;
    }
}
