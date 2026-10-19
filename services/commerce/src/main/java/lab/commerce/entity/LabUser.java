package lab.commerce.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class LabUser {
    private Long id;
    private String username;
    private String passwordHash;
}
