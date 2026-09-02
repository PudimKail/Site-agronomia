package com.siteagronomia.service;

import com.siteagronomia.model.Usuario;
import com.siteagronomia.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomUserDetailsServiceTest {

    @Mock
    private UsuarioRepository usuarioRepository;
    @InjectMocks
    private CustomUserDetailsService service;

    @Test
    void mapsUserAndRoleToSpringUserDetails() {
        Usuario usuario = new Usuario(1L, "alice", "encoded", "Alice", "alice@example.com", "ADMIN");
        when(usuarioRepository.findByUsername("alice")).thenReturn(Optional.of(usuario));

        var details = service.loadUserByUsername("alice");

        assertEquals("alice", details.getUsername());
        assertEquals("encoded", details.getPassword());
        assertTrue(details.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN")));
    }

    @Test
    void throwsWhenUserDoesNotExist() {
        when(usuarioRepository.findByUsername("missing")).thenReturn(Optional.empty());

        assertThrows(UsernameNotFoundException.class, () -> service.loadUserByUsername("missing"));
    }
}
