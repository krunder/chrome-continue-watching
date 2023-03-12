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

interface ContinueWatchingItem {
  contentId: string;
  mediaMetadata: {
    mediaId: string;
    runtimeMillis: number;
  };
}

interface ContinueWatchingResponseData {
  data: {
    ContinueWatchingSet: {
      items: ContinueWatchingItem[];
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

const sendGraphRequest = <D>(
  method: string,
  path: string,
  data?: D,
  options: RequestInit = {},
): Promise<Response> => (
    fetch(`${BASE_GRAPH_URL}/${path}`, {
      method,
      headers: {
        ...requestOptions.headers,
        ...(options.headers || {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    })
  );

const sendContentRequest = <D>(
  method: string,
  path: string,
  data?: D,
  options: RequestInit = {},
): Promise<Response> => (
    fetch(`${BASE_CONTENT_URL}/${path}`, {
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

  return sendContentRequest('GET', path)
    .then((response: Response): Promise<CollectionResponseData> => response.json());
};

const getContinueWatching = (setId: string): Promise<ContinueWatchingResponseData> => {
  const {
    isKidsModeEnabled, impliedMaturityRating, appLanguage, region,
  } = requestOptions;

  const path = `svc/content/ContinueWatching/Set/version/5.1/region/${region}/audience/k-${isKidsModeEnabled},l-true/maturity/${impliedMaturityRating}/language/${appLanguage}/setId/${setId}`;

  return sendContentRequest('GET', path)
    .then((response: Response): Promise<ContinueWatchingResponseData> => response.json());
};

const removeFromContinueWatching = (item: ContinueWatchingItem): Promise<string> => {
  const data = [
    {
      server: {
        fguid: 'unknown',
        mediaId: item.mediaMetadata.mediaId,
      },
      client: {
        event: 'urn:dss:telemetry-service:event:stream-sample',
        timestamp: (new Date()).getTime(),
        play_head: item.mediaMetadata.runtimeMillis / 1000,
        playback_session_id: 'unknown',
        bitrate: 50,
        interaction_id: 'unknown',
      },
    },
  ];

  return sendGraphRequest('POST', 'telemetry', data)
    .then((response: Response): Promise<string> => response.text());
};

const oldXHRSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;

window.XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(
  name: string,
  value: string,
) {
  if (name.toLowerCase() === 'authorization') {
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

      sendGraphRequest<GraphQLRequestData>('POST', 'v1/public/graphql', {
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
            continueWatchingContainer = collectionData.Collection.containers.find(
              (container: CollectionContainer): boolean => container.style === 'ContinueWatchingSet',
            );
          });
        });
    }
  }

  // @ts-ignore
  return oldXHRSetRequestHeader.apply(this, arguments);
};

const REMOVE_BUTTON_CLASS = 'continue-watching__remove';

const createRemoveButton = (contentId: string): HTMLButtonElement => {
  const removeButton: HTMLButtonElement = document.createElement('button');
  removeButton.classList.add('button', 'button--circle', 'button--circle-24', 'margin--left-4', REMOVE_BUTTON_CLASS);
  removeButton.style.padding = '3px';
  removeButton.type = 'button';
  removeButton.setAttribute('data-content-id', contentId);
  removeButton.addEventListener('click', (evt: MouseEvent): void => {
    evt.stopPropagation();

    if (continueWatchingContainer) {
      const { set: { refId: setId } } = continueWatchingContainer;

      getContinueWatching(setId).then(({ data }: ContinueWatchingResponseData): void => {
        const item = data.ContinueWatchingSet.items.find(
          (thisItem: ContinueWatchingItem): boolean => thisItem.contentId === contentId,
        );

        if (item) {
          removeFromContinueWatching(item)
            .then((): void => removeButton.closest('.slick-slide')?.remove());
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
  const section = document.querySelector<HTMLDivElement>('div[data-testid="continue-watching"]');

  if (section) {
    const assetMetadata = section.querySelector<HTMLDivElement>('#asset-metadata');

    if (assetMetadata) {
      const assets = section.querySelectorAll<HTMLDivElement>('#asset-metadata');

      assets.forEach((asset: HTMLDivElement): void => {
        const contentId = asset.closest<HTMLAnchorElement>('a[data-gv2elementtype="contentId"]')
          ?.getAttribute('data-gv2elementvalue');

        const actionsWrapper = asset.querySelector<HTMLButtonElement>('.button')?.closest('span');

        if (contentId && actionsWrapper) {
          if (!actionsWrapper.querySelector<HTMLButtonElement>(`.${REMOVE_BUTTON_CLASS}`)) {
            actionsWrapper.appendChild(createRemoveButton(contentId));
          }
        }
      });

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
