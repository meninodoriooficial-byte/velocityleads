import { useState, useEffect } from 'react';

interface City {
  id: string;
  name: string;
}

const citiesByState: Record<string, City[]> = {
  'AC': [
    { id: 'rio-branco', name: 'Rio Branco' },
    { id: 'cruzeiro-do-sul', name: 'Cruzeiro do Sul' },
    { id: 'sena-madureira', name: 'Sena Madureira' },
    { id: 'tarauaca', name: 'Tarauacá' }
  ],
  'AL': [
    { id: 'maceio', name: 'Maceió' },
    { id: 'arapiraca', name: 'Arapiraca' },
    { id: 'palmeira-dos-indios', name: 'Palmeira dos Índios' },
    { id: 'rio-largo', name: 'Rio Largo' }
  ],
  'AP': [
    { id: 'macapa', name: 'Macapá' },
    { id: 'santana', name: 'Santana' },
    { id: 'laranjal-do-jari', name: 'Laranjal do Jari' },
    { id: 'oiapoque', name: 'Oiapoque' }
  ],
  'AM': [
    { id: 'manaus', name: 'Manaus' },
    { id: 'parintins', name: 'Parintins' },
    { id: 'itacoatiara', name: 'Itacoatiara' },
    { id: 'manacapuru', name: 'Manacapuru' }
  ],
  'BA': [
    { id: 'salvador', name: 'Salvador' },
    { id: 'feira-de-santana', name: 'Feira de Santana' },
    { id: 'vitoria-da-conquista', name: 'Vitória da Conquista' },
    { id: 'camaçari', name: 'Camaçari' },
    { id: 'juazeiro', name: 'Juazeiro' },
    { id: 'lauro-de-freitas', name: 'Lauro de Freitas' }
  ],
  'CE': [
    { id: 'fortaleza', name: 'Fortaleza' },
    { id: 'caucaia', name: 'Caucaia' },
    { id: 'juazeiro-do-norte', name: 'Juazeiro do Norte' },
    { id: 'maracanau', name: 'Maracanaú' },
    { id: 'sobral', name: 'Sobral' }
  ],
  'DF': [
    { id: 'brasilia', name: 'Brasília' },
    { id: 'taguatinga', name: 'Taguatinga' },
    { id: 'ceilandia', name: 'Ceilândia' },
    { id: 'gama', name: 'Gama' }
  ],
  'ES': [
    { id: 'vitoria', name: 'Vitória' },
    { id: 'vila-velha', name: 'Vila Velha' },
    { id: 'cariacica', name: 'Cariacica' },
    { id: 'serra', name: 'Serra' },
    { id: 'cachoeiro-de-itapemirim', name: 'Cachoeiro de Itapemirim' }
  ],
  'GO': [
    { id: 'goiania', name: 'Goiânia' },
    { id: 'aparecida-de-goiania', name: 'Aparecida de Goiânia' },
    { id: 'anapolis', name: 'Anápolis' },
    { id: 'rio-verde', name: 'Rio Verde' },
    { id: 'luziania', name: 'Luziânia' }
  ],
  'MA': [
    { id: 'sao-luis', name: 'São Luís' },
    { id: 'imperatriz', name: 'Imperatriz' },
    { id: 'sao-jose-de-ribamar', name: 'São José de Ribamar' },
    { id: 'timon', name: 'Timon' },
    { id: 'caxias', name: 'Caxias' }
  ],
  'MT': [
    { id: 'cuiaba', name: 'Cuiabá' },
    { id: 'varzea-grande', name: 'Várzea Grande' },
    { id: 'rondonopolis', name: 'Rondonópolis' },
    { id: 'sinop', name: 'Sinop' },
    { id: 'tangara-da-serra', name: 'Tangará da Serra' }
  ],
  'MS': [
    { id: 'campo-grande', name: 'Campo Grande' },
    { id: 'dourados', name: 'Dourados' },
    { id: 'tres-lagoas', name: 'Três Lagoas' },
    { id: 'corumba', name: 'Corumbá' },
    { id: 'ponta-pora', name: 'Ponta Porã' }
  ],
  'MG': [
    { id: 'belo-horizonte', name: 'Belo Horizonte' },
    { id: 'uberlandia', name: 'Uberlândia' },
    { id: 'contagem', name: 'Contagem' },
    { id: 'juiz-de-fora', name: 'Juiz de Fora' },
    { id: 'betim', name: 'Betim' },
    { id: 'montes-claros', name: 'Montes Claros' },
    { id: 'ribeirao-das-neves', name: 'Ribeirão das Neves' },
    { id: 'uberaba', name: 'Uberaba' },
    { id: 'governador-valadares', name: 'Governador Valadares' },
    { id: 'ipatinga', name: 'Ipatinga' }
  ],
  'PA': [
    { id: 'belem', name: 'Belém' },
    { id: 'ananindeua', name: 'Ananindeua' },
    { id: 'santarem', name: 'Santarém' },
    { id: 'maraba', name: 'Marabá' },
    { id: 'parauapebas', name: 'Parauapebas' },
    { id: 'castanhal', name: 'Castanhal' }
  ],
  'PB': [
    { id: 'joao-pessoa', name: 'João Pessoa' },
    { id: 'campina-grande', name: 'Campina Grande' },
    { id: 'santa-rita', name: 'Santa Rita' },
    { id: 'patos', name: 'Patos' },
    { id: 'bayeux', name: 'Bayeux' }
  ],
  'PR': [
    { id: 'curitiba', name: 'Curitiba' },
    { id: 'londrina', name: 'Londrina' },
    { id: 'maringa', name: 'Maringá' },
    { id: 'ponta-grossa', name: 'Ponta Grossa' },
    { id: 'cascavel', name: 'Cascavel' },
    { id: 'sao-jose-dos-pinhais', name: 'São José dos Pinhais' },
    { id: 'foz-do-iguacu', name: 'Foz do Iguaçu' },
    { id: 'colombo', name: 'Colombo' }
  ],
  'PE': [
    { id: 'recife', name: 'Recife' },
    { id: 'jaboatao-dos-guararapes', name: 'Jaboatão dos Guararapes' },
    { id: 'olinda', name: 'Olinda' },
    { id: 'caruaru', name: 'Caruaru' },
    { id: 'petrolina', name: 'Petrolina' },
    { id: 'paulista', name: 'Paulista' },
    { id: 'cabo-de-santo-agostinho', name: 'Cabo de Santo Agostinho' }
  ],
  'PI': [
    { id: 'teresina', name: 'Teresina' },
    { id: 'parnaiba', name: 'Parnaíba' },
    { id: 'picos', name: 'Picos' },
    { id: 'piripiri', name: 'Piripiri' },
    { id: 'floriano', name: 'Floriano' }
  ],
  'RJ': [
    { id: 'rio-de-janeiro', name: 'Rio de Janeiro' },
    { id: 'sao-goncalo', name: 'São Gonçalo' },
    { id: 'duque-de-caxias', name: 'Duque de Caxias' },
    { id: 'nova-iguacu', name: 'Nova Iguaçu' },
    { id: 'niteroi', name: 'Niterói' },
    { id: 'campos-dos-goytacazes', name: 'Campos dos Goytacazes' },
    { id: 'belford-roxo', name: 'Belford Roxo' },
    { id: 'sao-joao-de-meriti', name: 'São João de Meriti' },
    { id: 'petropolis', name: 'Petrópolis' },
    { id: 'volta-redonda', name: 'Volta Redonda' }
  ],
  'RN': [
    { id: 'natal', name: 'Natal' },
    { id: 'mossoró', name: 'Mossoró' },
    { id: 'parnamirim', name: 'Parnamirim' },
    { id: 'sao-goncalo-do-amarante', name: 'São Gonçalo do Amarante' },
    { id: 'macaiba', name: 'Macaíba' }
  ],
  'RS': [
    { id: 'porto-alegre', name: 'Porto Alegre' },
    { id: 'caxias-do-sul', name: 'Caxias do Sul' },
    { id: 'pelotas', name: 'Pelotas' },
    { id: 'canoas', name: 'Canoas' },
    { id: 'santa-maria', name: 'Santa Maria' },
    { id: 'gravataí', name: 'Gravataí' },
    { id: 'viamao', name: 'Viamão' },
    { id: 'novo-hamburgo', name: 'Novo Hamburgo' },
    { id: 'sao-leopoldo', name: 'São Leopoldo' }
  ],
  'RO': [
    { id: 'porto-velho', name: 'Porto Velho' },
    { id: 'ji-parana', name: 'Ji-Paraná' },
    { id: 'ariquemes', name: 'Ariquemes' },
    { id: 'vilhena', name: 'Vilhena' },
    { id: 'cacoal', name: 'Cacoal' }
  ],
  'RR': [
    { id: 'boa-vista', name: 'Boa Vista' },
    { id: 'rorainopolis', name: 'Rorainópolis' },
    { id: 'caracarai', name: 'Caracaraí' },
    { id: 'alto-alegre', name: 'Alto Alegre' }
  ],
  'SC': [
    { id: 'florianopolis', name: 'Florianópolis' },
    { id: 'joinville', name: 'Joinville' },
    { id: 'blumenau', name: 'Blumenau' },
    { id: 'sao-jose', name: 'São José' },
    { id: 'criciuma', name: 'Criciúma' },
    { id: 'chapeco', name: 'Chapecó' },
    { id: 'itajai', name: 'Itajaí' },
    { id: 'lages', name: 'Lages' }
  ],
  'SP': [
    { id: 'sao-paulo', name: 'São Paulo' },
    { id: 'guarulhos', name: 'Guarulhos' },
    { id: 'campinas', name: 'Campinas' },
    { id: 'sao-bernardo-do-campo', name: 'São Bernardo do Campo' },
    { id: 'sao-jose-dos-campos', name: 'São José dos Campos' },
    { id: 'santo-andre', name: 'Santo André' },
    { id: 'ribeirao-preto', name: 'Ribeirão Preto' },
    { id: 'osasco', name: 'Osasco' },
    { id: 'sorocaba', name: 'Sorocaba' },
    { id: 'maua', name: 'Mauá' },
    { id: 'sao-jose-do-rio-preto', name: 'São José do Rio Preto' },
    { id: 'santos', name: 'Santos' },
    { id: 'mogi-das-cruzes', name: 'Mogi das Cruzes' },
    { id: 'diadema', name: 'Diadema' },
    { id: 'jundiai', name: 'Jundiaí' },
    { id: 'carapicuiba', name: 'Carapicuíba' },
    { id: 'piracicaba', name: 'Piracicaba' },
    { id: 'bauru', name: 'Bauru' },
    { id: 'itaquaquecetuba', name: 'Itaquaquecetuba' },
    { id: 'sao-vicente', name: 'São Vicente' }
  ],
  'SE': [
    { id: 'aracaju', name: 'Aracaju' },
    { id: 'nossa-senhora-do-socorro', name: 'Nossa Senhora do Socorro' },
    { id: 'lagarto', name: 'Lagarto' },
    { id: 'itabaiana', name: 'Itabaiana' },
    { id: 'sao-cristovao', name: 'São Cristóvão' }
  ],
  'TO': [
    { id: 'palmas', name: 'Palmas' },
    { id: 'araguaina', name: 'Araguaína' },
    { id: 'gurupi', name: 'Gurupi' },
    { id: 'porto-nacional', name: 'Porto Nacional' },
    { id: 'paraiso-do-tocantins', name: 'Paraíso do Tocantins' }
  ]
};

export const useCitiesByState = () => {
  const [selectedState, setSelectedState] = useState<string>('');
  const [availableCities, setAvailableCities] = useState<City[]>([]);

  useEffect(() => {
    if (selectedState) {
      setAvailableCities(citiesByState[selectedState] || []);
    } else {
      setAvailableCities([]);
    }
  }, [selectedState]);

  const updateState = (state: string) => {
    setSelectedState(state);
  };

  return {
    selectedState,
    availableCities,
    updateState,
  };
};