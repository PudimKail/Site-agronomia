package com.siteagronomia.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:8080", "file://"}, allowCredentials = "true")
public class DashboardController {

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> dashboard() {
        return ResponseEntity.ok(Map.of(
                "fazenda", "Fazenda Vale Verde",
                "areaMonitorada", "4.280 ha",
                "saudeVegetal", "86.2%",
                "rendimento", "7.840 kg",
                "status", "ativo"
        ));
    }
}
