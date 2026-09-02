package com.siteagronomia.service;

import com.siteagronomia.config.JwtService;
import com.siteagronomia.dto.AuthResponse;
import com.siteagronomia.dto.LoginRequest;
import com.siteagronomia.dto.UsuarioResponse;
import com.siteagronomia.model.Usuario;
import com.siteagronomia.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UsuarioRepository usuarioRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private AuthenticationManager authenticationManager;
    @Mock
    private JwtService jwtService;
    @Mock
    private Authentication authentication;
    @InjectMocks
    private AuthService authService;

    @Test
    void registersNewUserWithEncodedPasswordAndDefaultRole() {
        when(usuarioRepository.existsByUsername("alice")).thenReturn(false);
        when(passwordEncoder.encode("plain")).thenReturn("encoded");
        Usuario saved = new Usuario(7L, "alice", "encoded", "Alice", "alice@example.com", "USER");
        when(usuarioRepository.save(any(Usuario.class))).thenReturn(saved);

        UsuarioResponse response = authService.register("alice", "plain", "Alice", "alice@example.com");

        assertEquals(new UsuarioResponse(7L, "alice", "Alice", "alice@example.com", "USER"), response);
        ArgumentCaptor<Usuario> captor = ArgumentCaptor.forClass(Usuario.class);
        verify(usuarioRepository).save(captor.capture());
        assertEquals("encoded", captor.getValue().getPassword());
        assertEquals("USER", captor.getValue().getRole());
    }

    @Test
    void rejectsDuplicateUsername() {
        when(usuarioRepository.existsByUsername("alice")).thenReturn(true);

        RuntimeException error = assertThrows(RuntimeException.class,
                () -> authService.register("alice", "plain", "Alice", "alice@example.com"));

        assertEquals("Usuário já cadastrado", error.getMessage());
        verify(usuarioRepository, never()).save(any());
    }

    @Test
    void logsInAuthenticatedUserAndReturnsTokenAndRole() {
        LoginRequest request = new LoginRequest();
        request.setUsername("alice");
        request.setPassword("plain");
        User details = new User("alice", "encoded", java.util.List.of());
        Usuario usuario = new Usuario(7L, "alice", "encoded", "Alice", "alice@example.com", "ADMIN");
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(authentication);
        when(authentication.getPrincipal()).thenReturn(details);
        when(jwtService.generateToken(details)).thenReturn("token");
        when(usuarioRepository.findByUsername("alice")).thenReturn(Optional.of(usuario));

        AuthResponse response = authService.login(request);

        assertEquals(new AuthResponse("token", "alice", "ADMIN"), response);
        verify(authenticationManager).authenticate(any(UsernamePasswordAuthenticationToken.class));
    }

    @Test
    void findsUserByUsername() {
        Usuario usuario = new Usuario();
        when(usuarioRepository.findByUsername("alice")).thenReturn(Optional.of(usuario));

        assertSame(usuario, authService.buscarPorUsername("alice").orElseThrow());
    }
}
