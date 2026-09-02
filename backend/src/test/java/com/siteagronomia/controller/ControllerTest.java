package com.siteagronomia.controller;

import com.siteagronomia.dto.AuthResponse;
import com.siteagronomia.dto.LoginRequest;
import com.siteagronomia.dto.UsuarioResponse;
import com.siteagronomia.service.AuthService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ControllerTest {

    @Mock
    private AuthService authService;
    @InjectMocks
    private AuthController authController;

    @Test
    void loginDelegatesToService() {
        LoginRequest request = new LoginRequest();
        AuthResponse response = new AuthResponse("token", "alice", "USER");
        when(authService.login(request)).thenReturn(response);

        var result = authController.login(request);

        assertEquals(HttpStatus.OK, result.getStatusCode());
        assertSame(response, result.getBody());
    }

    @Test
    void registerDelegatesAllRequestParameters() {
        UsuarioResponse response = new UsuarioResponse(1L, "alice", "Alice", "a@example.com", "USER");
        when(authService.register("alice", "secret", "Alice", "a@example.com")).thenReturn(response);

        var result = authController.register("alice", "secret", "Alice", "a@example.com");

        assertEquals(HttpStatus.OK, result.getStatusCode());
        assertSame(response, result.getBody());
        verify(authService).register("alice", "secret", "Alice", "a@example.com");
    }

    @Test
    void healthReturnsOperationalMessage() {
        var result = authController.health();

        assertEquals(HttpStatus.OK, result.getStatusCode());
        assertEquals("API funcionando", result.getBody());
    }

    @Test
    void dashboardReturnsExpectedMetrics() {
        var result = new DashboardController().dashboard();

        assertEquals(HttpStatus.OK, result.getStatusCode());
        assertEquals("Fazenda Vale Verde", result.getBody().get("fazenda"));
        assertEquals("ativo", result.getBody().get("status"));
        assertEquals(5, result.getBody().size());
    }
}
