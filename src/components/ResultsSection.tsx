import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, Globe, Download, Star } from "lucide-react";

interface Company {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  category: string;
  rating: number;
  reviews: number;
  owner: string;
}

interface ResultsSectionProps {
  searchData: {
    category: string;
    state: string;
    city: string;
  } | null;
}

const mockCompanies: Company[] = [
  {
    id: "1",
    name: "PetCare Veterinária",
    address: "Rua das Flores, 123 - Centro",
    phone: "(11) 99999-9999",
    email: "contato@petcare.com.br",
    website: "www.petcare.com.br",
    category: "petshop",
    rating: 4.8,
    reviews: 127,
    owner: "Dr. Maria Silva"
  },
  {
    id: "2", 
    name: "Clínica Dental Sorriso",
    address: "Av. Paulista, 456 - Bela Vista",
    phone: "(11) 88888-8888",
    email: "agendamento@sorriso.com.br",
    website: "www.sorriso.com.br",
    category: "dentista",
    rating: 4.9,
    reviews: 203,
    owner: "Dr. João Santos"
  },
  {
    id: "3",
    name: "Consultório Dr. Lima",
    address: "Rua da Saúde, 789 - Vila Madalena",
    phone: "(11) 77777-7777",
    email: "secretaria@drlima.med.br",
    website: "www.drlima.med.br",
    category: "médico",
    rating: 4.7,
    reviews: 89,
    owner: "Dr. Carlos Lima"
  }
];

export const ResultsSection = ({ searchData }: ResultsSectionProps) => {
  if (!searchData) return null;

  return (
    <section className="py-16">
      <div className="container mx-auto px-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">
              Empresas de {searchData.category} em {searchData.city}, {searchData.state}
            </h2>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar Lista
            </Button>
          </div>
          <p className="text-muted-foreground">
            {mockCompanies.length} empresas encontradas
          </p>
        </div>

        <div className="grid gap-6">
          {mockCompanies.map((company) => (
            <Card key={company.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl mb-2">{company.name}</CardTitle>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">{company.category}</Badge>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">{company.rating}</span>
                        <span className="text-sm text-muted-foreground">({company.reviews} avaliações)</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Proprietário: {company.owner}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span className="text-sm">{company.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{company.phone}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{company.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{company.website}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};