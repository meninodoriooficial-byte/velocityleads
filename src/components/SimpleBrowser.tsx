
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Globe, ArrowLeft, ArrowRight, RefreshCw, Home, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SimpleBrowserProps {
  initialUrl?: string;
  height?: string;
}

export const SimpleBrowser = ({ initialUrl = "https://www.google.com/maps", height = "600px" }: SimpleBrowserProps) => {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleNavigate = () => {
    let url = inputUrl.trim();
    
    // Adicionar protocolo se não tiver
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    setIsLoading(true);
    setHasError(false);
    setCurrentUrl(url);
    setInputUrl(url);
    
    // Simular carregamento
    setTimeout(() => {
      setIsLoading(false);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  };

  const goHome = () => {
    const homeUrl = "https://www.google.com/maps";
    setInputUrl(homeUrl);
    setCurrentUrl(homeUrl);
    setHasError(false);
  };

  const refresh = () => {
    setIsLoading(true);
    setHasError(false);
    
    // Forçar reload do iframe
    const iframe = document.getElementById('browser-iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
    
    setTimeout(() => {
      setIsLoading(false);
    }, 2000);
  };

  const handleIframeError = () => {
    console.log('Erro ao carregar iframe:', currentUrl);
    setHasError(true);
    setIsLoading(false);
  };

  const handleIframeLoad = () => {
    console.log('Iframe carregado com sucesso:', currentUrl);
    setIsLoading(false);
    setHasError(false);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="w-5 h-5" />
          Navegador Web
        </CardTitle>
        
        {/* Barra de navegação */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.history.back()}
            className="p-2"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.history.forward()}
            className="p-2"
            title="Avançar"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="p-2"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={goHome}
            className="p-2"
            title="Página Inicial"
          >
            <Home className="w-4 h-4" />
          </Button>
          
          <div className="flex-1 flex gap-2">
            <Input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite uma URL... (ex: www.google.com)"
              className="flex-1"
            />
            <Button onClick={handleNavigate} size="sm">
              Ir
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {hasError && (
          <Alert className="m-4 border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Não foi possível carregar este site. Alguns sites não permitem carregamento em frames por segurança. 
              Tente acessar diretamente: 
              <a 
                href={currentUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline ml-1"
              >
                {currentUrl}
              </a>
            </AlertDescription>
          </Alert>
        )}
        
        <div className="relative" style={{ height }}>
          {isLoading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Carregando...</span>
              </div>
            </div>
          )}
          
          <iframe
            id="browser-iframe"
            src={currentUrl}
            className="w-full border-0 rounded-b-lg"
            style={{ height }}
            title="Browser"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-top-navigation"
            onError={handleIframeError}
            onLoad={handleIframeLoad}
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </CardContent>
    </Card>
  );
};
