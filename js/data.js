/*
 * Dados de demonstração da G5 em Campo.
 * Os limites dos talhões foram traçados sobre a imagem de satélite de lavouras reais
 * a leste de Campo Novo do Parecis (MT). Valores agronômicos são ilustrativos.
 */
window.G5 = window.G5 || {};

(function () {
  // Semanas da safra exibidas no gráfico de vigor (terças-feiras)
  const weeks = [];
  for (let day = new Date('2026-08-04T12:00:00'); day <= new Date('2026-10-20T12:00:00'); day.setDate(day.getDate() + 7)) {
    weeks.push(day.toISOString().slice(0, 10));
  }

  // Ruído determinístico para a série não mudar a cada recarga
  function seeded(seed) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  // Curva logística de NDVI: palhada antes do plantio, subida após a emergência
  function ndviSeries({ plantedAt, peak, seed, dip = 0 }) {
    const random = seeded(seed);
    const planted = plantedAt ? new Date(`${plantedAt}T12:00:00`).getTime() : null;
    return weeks.map((date, index) => {
      const time = new Date(`${date}T12:00:00`).getTime();
      let value = 0.2 + (random() - 0.5) * 0.03;
      if (planted && time > planted) {
        const daysAfter = (time - planted) / 86400000;
        value = 0.2 + (peak - 0.2) / (1 + Math.exp(-0.16 * (daysAfter - 26)));
        value += (random() - 0.5) * 0.025;
      }
      if (index === weeks.length - 1) value -= dip;
      return { date, value: Math.round(value * 100) / 100 };
    });
  }

  const fields = [
    {
      id: 'talhao-a',
      name: 'Talhão A',
      culture: 'Soja',
      plantedAt: '2026-09-10',
      stage: 'V6',
      moisture: 21.4,
      status: 'good',
      yieldEstimate: 68,
      yieldTarget: 65,
      polygon: [[-13.673343, -57.826408], [-13.674144, -57.820145], [-13.683484, -57.817948], [-13.688394, -57.817069], [-13.687754, -57.825364]],
      ndviSeries: ndviSeries({ plantedAt: '2026-09-10', peak: 0.86, seed: 11 })
    },
    {
      id: 'talhao-b',
      name: 'Talhão B',
      culture: 'Soja',
      plantedAt: '2026-10-02',
      stage: 'VE',
      moisture: 14.2,
      status: 'serious',
      yieldEstimate: 54,
      yieldTarget: 65,
      polygon: [[-13.683591, -57.817948], [-13.684551, -57.805424], [-13.690689, -57.805424], [-13.689622, -57.816685]],
      ndviSeries: ndviSeries({ plantedAt: '2026-10-02', peak: 0.84, seed: 23, dip: 0.04 })
    },
    {
      id: 'talhao-c',
      name: 'Talhão C',
      culture: 'Milho',
      plantedAt: '2026-08-28',
      stage: 'V9',
      moisture: 22.8,
      status: 'warning',
      yieldEstimate: 182,
      yieldTarget: 180,
      polygon: [[-13.672276, -57.832505], [-13.673236, -57.826847], [-13.68295, -57.826023], [-13.68215, -57.833439]],
      ndviSeries: ndviSeries({ plantedAt: '2026-08-28', peak: 0.88, seed: 37 })
    },
    {
      id: 'talhao-d',
      name: 'Talhão D',
      culture: 'Soja',
      plantedAt: '2026-09-14',
      stage: 'V5',
      moisture: 19.6,
      status: 'serious',
      yieldEstimate: 61,
      yieldTarget: 65,
      polygon: [[-13.674144, -57.820145], [-13.675478, -57.81218], [-13.684285, -57.810642], [-13.683591, -57.817948]],
      ndviSeries: ndviSeries({ plantedAt: '2026-09-14', peak: 0.83, seed: 41, dip: 0.07 })
    },
    {
      id: 'talhao-e',
      name: 'Talhão E',
      culture: 'Pousio',
      plantedAt: null,
      stage: 'Plantio previsto em 28/10',
      moisture: 16.1,
      status: 'idle',
      yieldEstimate: null,
      yieldTarget: null,
      polygon: [[-13.663095, -57.827287], [-13.662775, -57.817783], [-13.673984, -57.82009], [-13.671742, -57.833439]],
      ndviSeries: ndviSeries({ plantedAt: null, peak: 0.2, seed: 53 })
    },
    {
      id: 'talhao-f',
      name: 'Talhão F',
      culture: 'Milho',
      plantedAt: '2026-09-04',
      stage: 'V7',
      moisture: 24.9,
      status: 'warning',
      yieldEstimate: 171,
      yieldTarget: 180,
      polygon: [[-13.670514, -57.844535], [-13.672169, -57.832505], [-13.677613, -57.83289], [-13.675905, -57.844975]],
      ndviSeries: ndviSeries({ plantedAt: '2026-09-04', peak: 0.87, seed: 67, dip: 0.03 })
    }
  ];

  const alerts = [
    {
      id: 'alerta-1',
      fieldId: 'talhao-d',
      type: 'praga',
      severity: 'serious',
      title: 'Desfolha por lagarta',
      detail: 'Desfolha estimada em 18% numa reboleira de 3,2 ha no centro-leste do talhão.',
      recommendation: 'Vistoria com pano de batida e decisão de controle em até 48 horas.',
      position: [-13.678139, -57.814581],
      detectedAt: '2026-10-19T07:40:00',
      resolved: false
    },
    {
      id: 'alerta-2',
      fieldId: 'talhao-b',
      type: 'estande',
      severity: 'warning',
      title: 'Falha de emergência',
      detail: 'Estande 22% abaixo do planejado na faixa oeste do talhão.',
      recommendation: 'Contar plantas em cinco pontos e avaliar replantio parcial.',
      position: [-13.687517, -57.81366],
      detectedAt: '2026-10-18T08:10:00',
      resolved: false
    },
    {
      id: 'alerta-3',
      fieldId: 'talhao-b',
      type: 'agua',
      severity: 'serious',
      title: 'Estresse hídrico',
      detail: 'O vigor caiu 0,09 em sete dias na mancha de solo mais arenoso.',
      recommendation: 'Acompanhar a umidade do solo e priorizar este ponto no voo após a chuva prevista.',
      position: [-13.686725, -57.808789],
      detectedAt: '2026-10-19T09:05:00',
      resolved: false
    },
    {
      id: 'alerta-4',
      fieldId: 'talhao-a',
      type: 'daninha',
      severity: 'warning',
      title: 'Plantas daninhas em reboleira',
      detail: 'Mancha de 1,4 ha com cobertura de daninhas acima de 15%.',
      recommendation: 'Aplicação localizada usando o mapa de prescrição do voo.',
      position: [-13.677643, -57.823724],
      detectedAt: '2026-10-17T16:20:00',
      resolved: false
    },
    {
      id: 'alerta-5',
      fieldId: 'talhao-c',
      type: 'nutricao',
      severity: 'warning',
      title: 'Possível deficiência de nitrogênio',
      detail: 'Amarelecimento em faixa paralela às linhas de plantio.',
      recommendation: 'Coletar folhas para análise e revisar a adubação de cobertura.',
      position: [-13.679697, -57.829026],
      detectedAt: '2026-10-16T10:30:00',
      resolved: false
    },
    {
      id: 'alerta-6',
      fieldId: 'talhao-f',
      type: 'solo',
      severity: 'warning',
      title: 'Encharcamento na baixada',
      detail: 'Acúmulo de água depois da chuva de 14/10, com 0,8 ha afetados.',
      recommendation: 'Verificar terraços e drenagem antes da próxima operação.',
      position: [-13.6739, -57.841762],
      detectedAt: '2026-10-15T11:00:00',
      resolved: false
    },
    {
      id: 'alerta-7',
      fieldId: 'talhao-a',
      type: 'erosao',
      severity: 'warning',
      title: 'Sulco de erosão na bordadura',
      detail: 'Sulco de cerca de 120 m junto à estrada sul do talhão.',
      recommendation: 'Recompor o terraço e reforçar a cobertura de palha.',
      position: [-13.685628, -57.820001],
      detectedAt: '2026-10-12T14:45:00',
      resolved: false
    },
    {
      id: 'alerta-8',
      fieldId: 'talhao-e',
      type: 'daninha',
      severity: 'warning',
      title: 'Milho voluntário (tiguera)',
      detail: 'Plantas voluntárias em cerca de 6% da área em pousio.',
      recommendation: 'Dessecar antes do plantio previsto para 28/10.',
      position: [-13.667403, -57.824438],
      detectedAt: '2026-10-14T08:00:00',
      resolved: false
    }
  ];

  // Usado só quando a Open-Meteo não responde (apresentação sem internet estável)
  const weatherFallback = {
    current: { temperature: 29, humidity: 58, windSpeed: 11, windDirection: 45, weatherCode: 2, precipitation: 0 },
    daily: [
      ['2026-10-20', 21, 31, 35, 0.4, 2],
      ['2026-10-21', 22, 32, 40, 1.2, 2],
      ['2026-10-22', 22, 30, 70, 8.6, 80],
      ['2026-10-23', 21, 28, 85, 18.2, 63],
      ['2026-10-24', 20, 29, 60, 6.1, 61],
      ['2026-10-25', 21, 31, 30, 0.8, 2],
      ['2026-10-26', 22, 32, 45, 2.3, 3]
    ].map(([date, min, max, rainChance, rain, code]) => ({ date, min, max, rainChance, rain, weatherCode: code })),
    past: [
      ['2026-10-06', 0], ['2026-10-07', 0], ['2026-10-08', 2.4], ['2026-10-09', 0], ['2026-10-10', 11.8],
      ['2026-10-11', 4.2], ['2026-10-12', 0], ['2026-10-13', 0.6], ['2026-10-14', 23.5], ['2026-10-15', 7.9],
      ['2026-10-16', 0], ['2026-10-17', 0], ['2026-10-18', 1.1], ['2026-10-19', 0]
    ].map(([date, rain]) => ({ date, rain }))
  };

  G5.seed = {
    farm: {
      id: 'fazenda-campo-novo',
      name: 'Fazenda Campo Novo',
      city: 'Campo Novo do Parecis',
      state: 'MT',
      season: '2026/27',
      center: [-13.67806, -57.82343]
    },
    users: [{ username: 'admin', password: '123456', name: 'Admin', role: 'Gestor da fazenda' }],
    weeks,
    fields,
    alerts,
    weatherFallback,
    // Densidade de plantio usada no cálculo automático (plantas por hectare)
    plantingDensity: {
      Soja: 300000,
      Milho: 65000,
      'Algodão': 100000,
      Feijão: 220000,
      Trigo: 3000000,
      'Cana-de-açúcar': 12000,
      Pousio: 0,
      'Outra cultura': 0
    }
  };
})();
