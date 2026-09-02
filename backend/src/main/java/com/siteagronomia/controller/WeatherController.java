package com.siteagronomia.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@RestController
@RequestMapping("/api/weather")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:8080"})
public class WeatherController {

    private final RestClient restClient = RestClient.create();

    @GetMapping
    public ResponseEntity<Map> currentWeather() {
        Map response = restClient.get()
                .uri("https://api.open-meteo.com/v1/forecast?latitude=-13.6589&longitude=-57.8907&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto")
                .retrieve()
                .body(Map.class);
        return ResponseEntity.ok(response);
    }
}
