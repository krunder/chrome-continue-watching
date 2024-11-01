interface RequestOptions {
  isKidsModeEnabled: string;
  impliedMaturityRating: number;
  appLanguage: string;
  region: string;
  headers: {
    Authorization: string;
    'Content-Type': string;
    Accept: string;
  },
}

interface GraphQLRequestData {
  query: string;
  variables: Record<string, unknown>;
}

interface MeResponseData {
  data: {
    me: {
      account: {
        activeProfile: {
          attributes: {
            kidsModeEnabled: boolean;
            languagePreferences: {
              appLanguage: string;
            };
          };
        };
      };
    };
    activeSession: {
      preferredMaturityRating: {
        impliedMaturityRating: number;
      };
      location: {
        countryCode: string;
      }
    };
  };
}

interface CollectionContainer {
  style: string;
  set: {
    refId: string;
  };
}

interface CollectionResponseData {
  data: {
    Collection: {
      containers: CollectionContainer[];
    };
  };
}

interface ContentMediaMetadata {
  mediaId: string;
  runtimeMillis: number;
}

interface ContinueWatchingItemAction {
  'type': 'browse' | 'playback';
  availId?: string;
  partnerFeed?: {
    dmcContentId: string;
  }
}

interface ContinueWatchingItem {
  id: string;
  actions: ContinueWatchingItemAction[];
}

interface ContinueWatchingResponseData {
  data: {
    'set': {
      items: ContinueWatchingItem[];
    };
  };
}

interface EpisodesMeta {
  hits: number;
  offset: number;
  page_size: number;
  hasMore: boolean;
}

interface Season {
  seasonId: string;
  seasonSequenceNumber: number;
  episodes_meta: EpisodesMeta;
}

interface SeriesResponseData {
  data: {
    DmcSeriesBundle: {
      seasons: {
        seasons: Season[];
      };
    };
  };
}

interface EpisodeVideo {
  episodeSequenceNumber: number;
  mediaMetadata: ContentMediaMetadata;
}

interface EpisodesResponseData {
  data: {
    DmcEpisodes: {
      videos: EpisodeVideo[];
    };
  };
}

const BASE_GRAPH_URL = 'https://disney.api.edge.bamgrid.com';
const BASE_CONTENT_URL = 'https://disney.content.edge.bamgrid.com';

const requestOptions: RequestOptions = {
  isKidsModeEnabled: 'false',
  impliedMaturityRating: 0,
  appLanguage: 'en',
  region: 'GB',
  headers: {
    Authorization: '',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

let continueWatchingContainer: CollectionContainer | undefined;

let initialRequestAttempted = false;

const sendRequest = <D>(
  baseUrl: string,
  method: string,
  path: string,
  data?: D,
  options: RequestInit = {},
): Promise<Response> => (
    fetch(`${baseUrl}/${path}`, {
      method,
      headers: {
        ...requestOptions.headers,
        ...(options.headers || {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    })
  );

const getCollections = (): Promise<CollectionResponseData> => {
  const {
    isKidsModeEnabled, impliedMaturityRating, appLanguage, region,
  } = requestOptions;

  const path = `svc/content/Collection/PersonalizedCollection/version/6.0/region/${region}/audience/k-${isKidsModeEnabled},l-true/maturity/${impliedMaturityRating}/language/${appLanguage}/contentClass/home/slug/home`;

  return sendRequest(BASE_CONTENT_URL, 'GET', path)
    .then((response: Response): Promise<CollectionResponseData> => response.json());
};

const getContinueWatching = (setId: string): Promise<ContinueWatchingResponseData> => {
  const path = `explore/v1.7/set/${setId}?limit=15&offset=0&setStyle=continue_watching`;

  return sendRequest(BASE_GRAPH_URL, 'GET', path)
    .then((response: Response): Promise<ContinueWatchingResponseData> => response.json());
};

const getSeries = (encodedSeriesId: string): Promise<SeriesResponseData> => {
  const {
    isKidsModeEnabled, impliedMaturityRating, appLanguage, region,
  } = requestOptions;

  const path = `svc/content/DmcSeriesBundle/version/5.1/region/${region}/audience/k-${isKidsModeEnabled},l-true/maturity/${impliedMaturityRating}/language/${appLanguage}/encodedSeriesId/${encodedSeriesId}`;

  return sendRequest(BASE_CONTENT_URL, 'GET', path)
    .then((response: Response): Promise<SeriesResponseData> => response.json());
};

const getEpisodes = (seasonId: string): Promise<EpisodesResponseData> => {
  const {
    isKidsModeEnabled, impliedMaturityRating, appLanguage, region,
  } = requestOptions;

  const path = `svc/content/DmcEpisodes/version/5.1/region/${region}/audience/k-${isKidsModeEnabled},l-true/maturity/${impliedMaturityRating}/language/${appLanguage}/seasonId/${seasonId}/pageSize/60/page/1`;

  return sendRequest(BASE_CONTENT_URL, 'GET', path)
    .then((response: Response): Promise<EpisodesResponseData> => response.json());
};

const sendTelemetry = (mediaId: string, runtimeMillis: number): Promise<string> => {
  const data = [
    {
      server: {
        fguid: 'unknown',
        mediaId,
      },
      client: {
        event: 'urn:dss:telemetry-service:event:stream-sample',
        timestamp: (new Date()).getTime(),
        play_head: runtimeMillis / 1000,
        playback_session_id: 'unknown',
        bitrate: 50,
        interaction_id: 'unknown',
      },
    },
  ];

  return sendRequest(BASE_GRAPH_URL, 'POST', 'telemetry', data)
    .then((response: Response): Promise<string> => response.text());
};

const oldXHRSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;

window.XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(
  name: string,
  value: string,
) {
  if (name.toLowerCase() === 'authorization' && value) {
    requestOptions.headers.Authorization = value;

    const query = `
    query {
      me {
        account {
          activeProfile {
            attributes {
              kidsModeEnabled
              languagePreferences {
                appLanguage
              }
            }
          }
        }
      }
      activeSession {
        preferredMaturityRating {
          impliedMaturityRating
        }
        location {
          countryCode
        }
      }
    }
    `;

    if (!initialRequestAttempted) {
      initialRequestAttempted = true;

      setTimeout((): void => {
        sendRequest<GraphQLRequestData>(BASE_GRAPH_URL, 'POST', 'v1/public/graphql', {
          query,
          variables: {},
        })
          .then((response: Response): Promise<MeResponseData> => response.json())
          .then(({ data: meData }: MeResponseData): void => {
            const {
              me: { account: { activeProfile } },
              activeSession: { preferredMaturityRating, location },
            } = meData;

            requestOptions.isKidsModeEnabled = activeProfile.attributes.kidsModeEnabled
              ? 'true'
              : 'false';
            requestOptions.impliedMaturityRating = preferredMaturityRating.impliedMaturityRating;
            requestOptions.appLanguage = activeProfile.attributes.languagePreferences.appLanguage;
            requestOptions.region = location.countryCode;

            getCollections().then(({ data: collectionData }: CollectionResponseData): void => {
              const style = 'ContinueWatchingSet';

              continueWatchingContainer = collectionData.Collection.containers.find(
                (container: CollectionContainer): boolean => container.style === style,
              );
            });
          });
      }, 2000);
    }
  }

  // @ts-ignore
  return oldXHRSetRequestHeader.apply(this, arguments);
};

const REMOVE_BUTTON_CLASS = 'continue-watching__remove';

const createRemoveButton = (id: string): HTMLButtonElement => {
  const removeButton: HTMLButtonElement = document.createElement('button');
  removeButton.classList.add('button', 'button--circle', 'button--circle-24', 'margin--left-4', REMOVE_BUTTON_CLASS);
  removeButton.style.padding = '3px';
  removeButton.type = 'button';
  removeButton.setAttribute('data-content-id', id);
  removeButton.addEventListener('click', (evt: MouseEvent): void => {
    evt.stopPropagation();

    if (continueWatchingContainer) {
      const { set: { refId: setId } } = continueWatchingContainer;

      getContinueWatching(setId).then(({ data }: ContinueWatchingResponseData): void => {
        const item = data['set'].items.find(
          (thisItem: ContinueWatchingItem): boolean => thisItem.id === id,
        );

        if (item) {
          const action = item?.actions.find(
            (action: ContinueWatchingItemAction) => action['type'] === 'playback'
          );
          const contentId = action?.partnerFeed?.dmcContentId;

          console.log(contentId);

          if (item.encodedSeriesId) {
            getSeries(item.encodedSeriesId).then((
              { data }: SeriesResponseData,
            ): Promise<EpisodesResponseData> => {
              const { seasons } = data.DmcSeriesBundle.seasons;

              const latestSeason = seasons.reduce((latest: Season, season: Season): Season => (
                (
                  season.seasonSequenceNumber > latest.seasonSequenceNumber && season.episodes_meta.hits > 0
                ) ? season : latest
              // @ts-ignore
              ), { seasonSequenceNumber: 0 });

              return getEpisodes(latestSeason.seasonId);
            }).then(({ data }: EpisodesResponseData): void => {
              const { videos } = data.DmcEpisodes;

              const latestEpisode: EpisodeVideo = videos.reduce((
                latest: EpisodeVideo,
                episode: EpisodeVideo,
              ): EpisodeVideo => (
                episode.episodeSequenceNumber > latest.episodeSequenceNumber ? episode : latest
              // @ts-ignore
              ), { episodeSequenceNumber: 0 });

              const { mediaId, runtimeMillis } = latestEpisode.mediaMetadata;

              // We have to first fake that we have started the last episode
              sendTelemetry(mediaId, 5000)
                .then((): Promise<string> => sendTelemetry(mediaId, runtimeMillis))
                .then((): void => removeButton.closest('.slick-slide')?.remove());
            });
          } else {
            sendTelemetry(item.mediaMetadata.mediaId, item.mediaMetadata.runtimeMillis)
              .then((): void => removeButton.closest('.slick-slide')?.remove());
          }
        }
      });
    }
  });

  const removeIcon: HTMLSpanElement = document.createElement('span');
  removeIcon.classList.add('icon', 'icon--close', 'icon--size-24');

  removeButton.appendChild(removeIcon);

  return removeButton;
};

const observer = new MutationObserver((
  mutations: MutationRecord[],
  obs: MutationObserver,
): void => {
  const section = document.querySelector('section[data-set-style="continue_watching"]');

  if (section) {
    const items = section.querySelectorAll<HTMLDivElement>('a[data-testid="set-item"]');

    items.forEach((item: HTMLDivElement): void => {
      const wrapper = item.closest<HTMLSpanElement>('span[data-testid="cw-set-item-wrapper"]');

      const id = item.getAttribute('data-item-id');
      if (wrapper && id && !wrapper?.querySelector<HTMLButtonElement>(`.${REMOVE_BUTTON_CLASS}`)) {
        wrapper.appendChild(createRemoveButton(id));
      }
    });

    if (items.length > 0) {
      obs.disconnect();
    }
  }
});

const startMainObserver = (): void => {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};

startMainObserver();

let originalHref = document.location.href;

const locationObserver = new MutationObserver((): void => {
  if (originalHref !== document.location.href) {
    [
      'https://disneyplus.com/',
      'https://disneyplus.com/home',
      'https://www.disneyplus.com/',
      'https://www.disneyplus.com/home',
    ].forEach((pattern: string): void => {
      if (document.location.href.startsWith(pattern.trim())) {
        originalHref = document.location.href;
        startMainObserver();
      }
    });
  }
});

locationObserver.observe(document, {
  childList: true,
  subtree: true,
});
