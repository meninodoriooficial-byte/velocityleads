import { Button } from "@/components/ui/button";
import { Search, Database, Users } from "lucide-react";

export const HeroSection = () => {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/20"></div>
      
      <div className="container mx-auto px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-2 bg-secondary/50 rounded-full px-4 py-2 border">
              <Database className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Inteligência de Negócios</span>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Encontre Qualquer
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Empresa </span>
            em Segundos
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Sistema completo de busca empresarial que encontra dados detalhados de negócios por categoria, 
            localização e ramo de atividade usando inteligência artificial.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" className="bg-primary hover:bg-primary/90">
              <Search className="w-5 h-5 mr-2" />
              Começar Busca Gratuita
            </Button>
            <Button size="lg" variant="outline">
              <Users className="w-5 h-5 mr-2" />
              Ver Demonstração
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Busca Inteligente</h3>
              <p className="text-muted-foreground text-sm">Encontre empresas por categoria, cidade e estado</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Dados Completos</h3>
              <p className="text-muted-foreground text-sm">Nome, endereço, telefone, email, site e redes sociais</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Export & CRM</h3>
              <p className="text-muted-foreground text-sm">Exporte listas e integre com seu CRM</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};