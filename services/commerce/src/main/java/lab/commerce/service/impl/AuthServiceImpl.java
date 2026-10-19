package lab.commerce.service.impl;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import lab.commerce.exception.OrderAccessException;
import lab.commerce.mapper.UserMapper;
import lab.commerce.service.AuthService;
import lab.commerce.vo.SessionView.UserView;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static lab.commerce.exception.OrderAccessException.Reason.INVALID_CREDENTIALS;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final UserMapper mapper;
    // Unknown users still perform PBKDF2 work, without storing a plaintext fallback password.
    private static final String DUMMY_HASH = "pbkdf2_sha256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    @Override
    public UserView login(String username, String password) {
        var user = mapper.findByUsername(username);
        boolean matches = verify(password, user == null ? DUMMY_HASH : user.getPasswordHash());
        if (user == null || !matches) {
            throw new OrderAccessException(INVALID_CREDENTIALS);
        }
        return new UserView(user.getId(), user.getUsername());
    }

    static boolean verify(String password, String encoded) {
        String[] parts = encoded.split("\\$");
        if (parts.length != 4 || !"pbkdf2_sha256".equals(parts[0])) return false;
        PBEKeySpec spec = null;
        try {
            int iterations = Integer.parseInt(parts[1]);
            if (iterations < 100_000 || iterations > 2_000_000) return false;
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            if (expected.length != 32) return false;
            spec = new PBEKeySpec(password.toCharArray(), Base64.getDecoder().decode(parts[2]), iterations, 256);
            byte[] actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return MessageDigest.isEqual(actual, expected);
        } catch (IllegalArgumentException exception) {
            return false;
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Required JDK password algorithm is unavailable", exception);
        } finally {
            if (spec != null) spec.clearPassword();
        }
    }
}
