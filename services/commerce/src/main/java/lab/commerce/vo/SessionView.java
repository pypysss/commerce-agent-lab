package lab.commerce.vo;

public record SessionView(UserView user, String csrfToken) {
    public record UserView(long id, String username) {}
}
