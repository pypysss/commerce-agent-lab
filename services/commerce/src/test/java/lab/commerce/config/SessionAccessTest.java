package lab.commerce.config;

import lab.commerce.exception.OrderAccessException;
import lab.commerce.vo.SessionView.UserView;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

import static org.assertj.core.api.Assertions.*;

class SessionAccessTest {
    @Test
    void verifiedRequestKeepsItsIdentityWhenAnotherTabSignsInAsSomeoneElse() {
        var access = new SessionAccess();
        var session = new MockHttpSession();
        access.signIn(session, new UserView(1, "alice"));
        String aliceToken = access.view(session).csrfToken();
        var oldRequest = new MockHttpServletRequest("POST", "/api/v1/orders");
        oldRequest.setSession(session);
        oldRequest.addHeader("X-CSRF-Token", aliceToken);
        assertThat(access.preHandle(oldRequest, new MockHttpServletResponse(), new Object())).isTrue();

        access.signIn(session, new UserView(2, "bob"));
        assertThat(access.requireUser(oldRequest)).isEqualTo(1);
        var nextRequest = new MockHttpServletRequest("POST", "/api/v1/orders");
        nextRequest.setSession(session);
        nextRequest.addHeader("X-CSRF-Token", aliceToken);
        assertThatThrownBy(() -> access.preHandle(nextRequest, new MockHttpServletResponse(), new Object()))
                .isInstanceOf(OrderAccessException.class);
        assertThat(access.view(session).user().id()).isEqualTo(2);
    }
}
