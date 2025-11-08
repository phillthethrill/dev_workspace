import { TMDBShow, TMDBMovie, ServiceAvailability } from '../types';

export class GermanVODChecker {
  private services: Record<string, string> = {
    'netflix': 'Netflix',
    'prime': 'Amazon Prime Video',
    'disney': 'Disney+',
    'apple': 'Apple TV+',
    'sky': 'Sky Deutschland',
    'paramount': 'Paramount+',
    'wow': 'WOW',
    'rtl': 'RTL+',
    'crunchyroll': 'Crunchyroll'
  };

  async checkShowAvailability(tmdbShow: TMDBShow): Promise<string[]> {
    const availableServices: string[] = [];

    if (tmdbShow['watch/providers']?.results?.DE?.flatrate) {
      const providers = tmdbShow['watch/providers'].results.DE.flatrate;

      for (const provider of providers) {
        const serviceSlug = this.mapProviderToService(provider.provider_name);
        if (serviceSlug) {
          availableServices.push(serviceSlug);
        }
      }
    }

    return availableServices;
  }

  async checkMovieAvailability(tmdbMovie: TMDBMovie): Promise<string[]> {
    const availableServices: string[] = [];

    if (tmdbMovie['watch/providers']?.results?.DE?.flatrate) {
      const providers = tmdbMovie['watch/providers'].results.DE.flatrate;

      for (const provider of providers) {
        const serviceSlug = this.mapProviderToService(provider.provider_name);
        if (serviceSlug) {
          availableServices.push(serviceSlug);
        }
      }
    }

    return availableServices;
  }

  private mapProviderToService(providerName: string): string | null {
    const mapping: Record<string, string> = {
      'Netflix': 'netflix',
      'Amazon Prime Video': 'prime',
      'Disney Plus': 'disney',
      'Apple TV Plus': 'apple',
      'Sky Deutschland': 'sky',
      'Paramount Plus': 'paramount',
      'WOW': 'wow',
      'RTL+': 'rtl',
      'Crunchyroll': 'crunchyroll'
    };

    return mapping[providerName] || null;
  }

  getServiceName(slug: string): string {
    return this.services[slug] || slug;
  }

  getAllServices(): Record<string, string> {
    return { ...this.services };
  }

  isGermanService(service: string): boolean {
    return service in this.services;
  }
}