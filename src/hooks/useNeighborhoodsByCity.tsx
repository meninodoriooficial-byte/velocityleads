import { useState, useEffect } from 'react';

interface Neighborhood {
  id: string;
  name: string;
}

const neighborhoodsByCity: Record<string, Neighborhood[]> = {
  // São Paulo - SP
  'São Paulo': [
    { id: 'centro', name: 'Centro' },
    { id: 'vila-madalena', name: 'Vila Madalena' },
    { id: 'pinheiros', name: 'Pinheiros' },
    { id: 'itaim-bibi', name: 'Itaim Bibi' },
    { id: 'moema', name: 'Moema' },
    { id: 'vila-olimpia', name: 'Vila Olímpia' },
    { id: 'jardins', name: 'Jardins' },
    { id: 'liberdade', name: 'Liberdade' },
    { id: 'santana', name: 'Santana' },
    { id: 'tatuape', name: 'Tatuapé' },
    { id: 'morumbi', name: 'Morumbi' },
    { id: 'vila-mariana', name: 'Vila Mariana' },
    { id: 'ipiranga', name: 'Ipiranga' },
    { id: 'brooklin', name: 'Brooklin' },
    { id: 'campo-belo', name: 'Campo Belo' }
  ],
  
  // Rio de Janeiro - RJ
  'Rio de Janeiro': [
    { id: 'copacabana', name: 'Copacabana' },
    { id: 'ipanema', name: 'Ipanema' },
    { id: 'leblon', name: 'Leblon' },
    { id: 'barra-da-tijuca', name: 'Barra da Tijuca' },
    { id: 'tijuca', name: 'Tijuca' },
    { id: 'centro-rj', name: 'Centro' },
    { id: 'botafogo', name: 'Botafogo' },
    { id: 'flamengo', name: 'Flamengo' },
    { id: 'lagoa', name: 'Lagoa' },
    { id: 'gavea', name: 'Gávea' },
    { id: 'recreio', name: 'Recreio dos Bandeirantes' },
    { id: 'zona-norte', name: 'Zona Norte' },
    { id: 'meier', name: 'Méier' },
    { id: 'madureira', name: 'Madureira' }
  ],
  
  // Belo Horizonte - MG
  'Belo Horizonte': [
    { id: 'centro-bh', name: 'Centro' },
    { id: 'savassi', name: 'Savassi' },
    { id: 'funcionarios', name: 'Funcionários' },
    { id: 'lourdes', name: 'Lourdes' },
    { id: 'serra', name: 'Serra' },
    { id: 'buritis', name: 'Buritis' },
    { id: 'pampulha', name: 'Pampulha' },
    { id: 'cidade-nova', name: 'Cidade Nova' },
    { id: 'barreiro', name: 'Barreiro' },
    { id: 'venda-nova', name: 'Venda Nova' }
  ],
  
  // Brasília - DF
  'Brasília': [
    { id: 'asa-norte', name: 'Asa Norte' },
    { id: 'asa-sul', name: 'Asa Sul' },
    { id: 'lago-norte', name: 'Lago Norte' },
    { id: 'lago-sul', name: 'Lago Sul' },
    { id: 'sudoeste', name: 'Sudoeste' },
    { id: 'noroeste', name: 'Noroeste' },
    { id: 'aguas-claras', name: 'Águas Claras' },
    { id: 'vicente-pires', name: 'Vicente Pires' },
    { id: 'taguatinga', name: 'Taguatinga' },
    { id: 'ceilandia', name: 'Ceilândia' }
  ],
  
  // Salvador - BA
  'Salvador': [
    { id: 'pelourinho', name: 'Pelourinho' },
    { id: 'barra', name: 'Barra' },
    { id: 'ondina', name: 'Ondina' },
    { id: 'rio-vermelho', name: 'Rio Vermelho' },
    { id: 'pituba', name: 'Pituba' },
    { id: 'itaigara', name: 'Itaigara' },
    { id: 'campo-grande', name: 'Campo Grande' },
    { id: 'brotas', name: 'Brotas' },
    { id: 'federacao', name: 'Federação' },
    { id: 'cajazeiras', name: 'Cajazeiras' }
  ],
  
  // Fortaleza - CE
  'Fortaleza': [
    { id: 'meireles', name: 'Meireles' },
    { id: 'iracema', name: 'Iracema' },
    { id: 'aldeota', name: 'Aldeota' },
    { id: 'cocó', name: 'Cocó' },
    { id: 'centro-fort', name: 'Centro' },
    { id: 'mucuripe', name: 'Mucuripe' },
    { id: 'papicu', name: 'Papicu' },
    { id: 'varjota', name: 'Varjota' },
    { id: 'fatima', name: 'Fátima' },
    { id: 'benfica', name: 'Benfica' }
  ],
  
  // Recife - PE
  'Recife': [
    { id: 'recife-antigo', name: 'Recife Antigo' },
    { id: 'boa-viagem', name: 'Boa Viagem' },
    { id: 'pina', name: 'Pina' },
    { id: 'santo-amaro', name: 'Santo Amaro' },
    { id: 'derby', name: 'Derby' },
    { id: 'espinheiro', name: 'Espinheiro' },
    { id: 'gracas', name: 'Graças' },
    { id: 'madalena', name: 'Madalena' },
    { id: 'casa-forte', name: 'Casa Forte' },
    { id: 'parnamirim', name: 'Parnamirim' }
  ],
  
  // Porto Alegre - RS
  'Porto Alegre': [
    { id: 'centro-poa', name: 'Centro' },
    { id: 'cidade-baixa', name: 'Cidade Baixa' },
    { id: 'moinhos-de-vento', name: 'Moinhos de Vento' },
    { id: 'bela-vista', name: 'Bela Vista' },
    { id: 'petrópolis', name: 'Petrópolis' },
    { id: 'higienópolis', name: 'Higienópolis' },
    { id: 'mont-serrat', name: 'Mont\'Serrat' },
    { id: 'rio-branco', name: 'Rio Branco' },
    { id: 'menino-deus', name: 'Menino Deus' },
    { id: 'zona-sul', name: 'Zona Sul' }
  ],
  
  // Curitiba - PR
  'Curitiba': [
    { id: 'centro-cwb', name: 'Centro' },
    { id: 'batel', name: 'Batel' },
    { id: 'agua-verde', name: 'Água Verde' },
    { id: 'bigorrilho', name: 'Bigorrilho' },
    { id: 'cabral', name: 'Cabral' },
    { id: 'champagnat', name: 'Champagnat' },
    { id: 'juvevê', name: 'Juvevê' },
    { id: 'mercês', name: 'Mercês' },
    { id: 'vila-izabel', name: 'Vila Izabel' },
    { id: 'portão', name: 'Portão' }
  ],
  
  // Goiânia - GO
  'Goiânia': [
    { id: 'centro-gyn', name: 'Centro' },
    { id: 'setor-bueno', name: 'Setor Bueno' },
    { id: 'setor-oeste', name: 'Setor Oeste' },
    { id: 'setor-marista', name: 'Setor Marista' },
    { id: 'setor-sul', name: 'Setor Sul' },
    { id: 'jardim-goiás', name: 'Jardim Goiás' },
    { id: 'setor-aeroporto', name: 'Setor Aeroporto' },
    { id: 'vila-nova', name: 'Vila Nova' },
    { id: 'campinas', name: 'Campinas' },
    { id: 'nova-suíça', name: 'Nova Suíça' }
  ],
  
  // Manaus - AM
  'Manaus': [
    { id: 'centro-manaus', name: 'Centro' },
    { id: 'adrianópolis', name: 'Adrianópolis' },
    { id: 'nossa-senhora-das-gracas', name: 'Nossa Senhora das Graças' },
    { id: 'chapada', name: 'Chapada' },
    { id: 'vieiralves', name: 'Vieiralves' },
    { id: 'parque-dez', name: 'Parque Dez' },
    { id: 'cidade-nova-manaus', name: 'Cidade Nova' },
    { id: 'aleixo', name: 'Aleixo' },
    { id: 'flores', name: 'Flores' },
    { id: 'ponta-negra', name: 'Ponta Negra' }
  ]
};

export const useNeighborhoodsByCity = () => {
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState<Neighborhood[]>([]);

  useEffect(() => {
    if (selectedCity) {
      setAvailableNeighborhoods(neighborhoodsByCity[selectedCity] || []);
    } else {
      setAvailableNeighborhoods([]);
    }
  }, [selectedCity]);

  const updateCity = (city: string) => {
    setSelectedCity(city);
  };

  return {
    selectedCity,
    availableNeighborhoods,
    updateCity,
  };
};