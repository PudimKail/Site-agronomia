package com.siteagronomia.service;

import com.siteagronomia.config.JwtService;
import com.siteagronomia.dto.AuthResponse;
import com.siteagronomia.dto.LoginRequest;
import com.siteagronomia.dto.UsuarioResponse;
import com.siteagronomia.model.Usuario;
import com.siteagronomia.repository.UsuarioRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthService(UsuarioRepository usuarioRepository,
                       PasswordEncoder passwordEncoder,
                       AuthenticationManager authenticationManager,
                       JwtService jwtService) {
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );

        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        String token = jwtService.generateToken(userDetails);

        Usuario usuario = usuarioRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));

        return new AuthResponse(token, usuario.getUsername(), usuario.getRole());
    }

    public UsuarioResponse register(String username, String password, String nome, String email) {
        if (usuarioRepository.existsByUsername(username)) {
            throw new RuntimeException("Usuário já cadastrado");
        }

        Usuario usuario = new Usuario();
        usuario.setUsername(username);
        usuario.setPassword(passwordEncoder.encode(password));
        usuario.setNome(nome);
        usuario.setEmail(email);
        usuario.setRole("USER");

        Usuario salvo = usuarioRepository.save(usuario);
        return new UsuarioResponse(salvo.getId(), salvo.getUsername(), salvo.getNome(), salvo.getEmail(), salvo.getRole());
    }

    public Optional<Usuario> buscarPorUsername(String username) {
        return usuarioRepository.findByUsername(username);
    }
}
