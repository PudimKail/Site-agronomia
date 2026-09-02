package com.siteagronomia.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UsuarioResponse {
    private Long id;
    private String username;
    private String nome;
    private String email;
    private String role;
}
