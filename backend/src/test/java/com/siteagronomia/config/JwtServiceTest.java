package com.siteagronomia.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secretKey",
                "aW1wb3J0YW50ZS1wYXNzLW1ha2Utc2VjcmV0LWNsaW50LXRlc3Q=");
        ReflectionTestUtils.setField(jwtService, "jwtExpiration", 60_000L);
    }

    @Test
    void generatesAndValidatesTokenForUser() {
        User user = new User("alice", "password", java.util.List.of());

        String token = jwtService.generateToken(user);

        assertEquals("alice", jwtService.extractUsername(token));
        assertTrue(jwtService.isTokenValid(token, user));
    }

    @Test
    void rejectsTokenForDifferentUser() {
        User tokenUser = new User("alice", "password", java.util.List.of());
        User otherUser = new User("bob", "password", java.util.List.of());

        String token = jwtService.generateToken(tokenUser);

        assertFalse(jwtService.isTokenValid(token, otherUser));
    }
}
