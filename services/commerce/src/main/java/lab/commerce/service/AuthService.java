package lab.commerce.service;

import lab.commerce.vo.SessionView.UserView;

public interface AuthService {
    UserView login(String username, String password);
}
