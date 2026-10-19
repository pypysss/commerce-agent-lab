package lab.commerce.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {
    private final SessionAccess sessions;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(sessions).addPathPatterns("/api/**");
    }
}
