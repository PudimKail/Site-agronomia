package com.siteagronomia.controller;

import com.siteagronomia.dto.AuthResponse;
import com.siteagronomia.dto.LoginRequest;
import com.siteagronomia.dto.UsuarioResponse;
import com.siteagronomia.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:8080", "file://"}, allowCredentials = "true")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/register")
    public ResponseEntity<UsuarioResponse> register(
            @RequestParam String username,
            @RequestParam String password,
            @RequestParam String nome,
            @RequestParam String email) {

        UsuarioResponse response = authService.register(username, password, nome, email);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("API funcionando");
    }
}
