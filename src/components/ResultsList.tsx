import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Instagram, Facebook, MapPin } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ResultsListProps {
  results: any[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const instagramUrl = (handle: string) => {
  if (!handle) return "#";
  if (/^https?:\/\//i.test(handle)) return handle;
  const username = handle.replace(/^@/, "").trim();
  return `https://instagram.com/${encodeURIComponent(username)}`;
};

const facebookUrl = (value: string) => {
  if (!value) return "#";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.facebook.com/${encodeURIComponent(value.trim())}`;
};

export const ResultsList = ({ results, isLoading, hasMore, onLoadMore }: ResultsListProps) => {
  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        if (!isLoading && hasMore) {
          onLoadMore();
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, onLoadMore]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Buscando empresas...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Nenhum resultado encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Empresa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="min-w-[220px]">Endereço</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Instagram</TableHead>
              <TableHead>Facebook</TableHead>
              <TableHead>Avaliação</TableHead>
              <TableHead>Mapa</TableHead>
              <TableHead>Fonte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.business_name}</TableCell>
                <TableCell>
                  {r.business_type ? (
                    <Badge variant="secondary" className="text-xs">{r.business_type}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{r.address || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {r.phone ? (
                    <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {r.email ? (
                    <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm max-w-[180px] truncate">
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {r.website}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.social_media?.instagram ? (
                    <a
                      href={instagramUrl(r.social_media.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      <Instagram className="w-3 h-3" />
                      {r.social_media.instagram}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.social_media?.facebook ? (
                    <a
                      href={facebookUrl(r.social_media.facebook)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      <Facebook className="w-3 h-3" />
                      {r.social_media.facebook}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {r.rating ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500 fill-current" />
                      {r.rating}
                      {r.reviews_count ? <span className="text-muted-foreground">({r.reviews_count})</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.additional_data?.google_url ? (
                    <a
                      href={r.additional_data.google_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      <MapPin className="w-3 h-3" />
                      Abrir
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{r.source_api ?? "—"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Carregamento e botão carregar mais */}
      {(isLoading || hasMore) && (
        <div className="text-center py-8">
          {isLoading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="text-muted-foreground">Carregando mais resultados...</span>
            </div>
          ) : hasMore ? (
            <Button onClick={onLoadMore} variant="outline" size="lg">
              Carregar mais resultados
            </Button>
          ) : null}
        </div>
      )}

      {/* Informações dos resultados */}
      <div className="text-center text-sm text-muted-foreground">
        {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
        {!isLoading && !hasMore && results.length > 0 && (
          <span className="block mt-1">Todos os resultados foram carregados</span>
        )}
      </div>
    </div>
  );
};