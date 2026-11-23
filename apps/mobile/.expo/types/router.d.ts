/* eslint-disable */
import * as Router from 'expo-router'

export * from 'expo-router'

declare module 'expo-router' {
    export namespace ExpoRouter {
        export interface __routes<T extends string | object = string> {
            hrefInputParams:
                | {
                      pathname: Router.RelativePathString
                      params?: Router.UnknownInputParams
                  }
                | {
                      pathname: Router.ExternalPathString
                      params?: Router.UnknownInputParams
                  }
                | { pathname: `/pair`; params?: Router.UnknownInputParams }
                | {
                      pathname: `/select-home`
                      params?: Router.UnknownInputParams
                  }
                | { pathname: `/welcome`; params?: Router.UnknownInputParams }
                | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
                | {
                      pathname: `${'/(app)'}/account` | `/account`
                      params?: Router.UnknownInputParams
                  }
                | {
                      pathname: `${'/(app)'}/rooms` | `/rooms`
                      params?: Router.UnknownInputParams
                  }
                | {
                      pathname: `${'/(app)'}/settings` | `/settings`
                      params?: Router.UnknownInputParams
                  }
                | {
                      pathname: `${'/(app)'}${'/(tabs)'}/devices` | `/devices`
                      params?: Router.UnknownInputParams
                  }
                | {
                      pathname: `${'/(app)'}${'/(tabs)'}/energy` | `/energy`
                      params?: Router.UnknownInputParams
                  }
                | {
                      pathname: `${'/(app)'}${'/(tabs)'}` | `/`
                      params?: Router.UnknownInputParams
                  }
            hrefOutputParams:
                | {
                      pathname: Router.RelativePathString
                      params?: Router.UnknownOutputParams
                  }
                | {
                      pathname: Router.ExternalPathString
                      params?: Router.UnknownOutputParams
                  }
                | { pathname: `/pair`; params?: Router.UnknownOutputParams }
                | {
                      pathname: `/select-home`
                      params?: Router.UnknownOutputParams
                  }
                | { pathname: `/welcome`; params?: Router.UnknownOutputParams }
                | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams }
                | {
                      pathname: `${'/(app)'}/account` | `/account`
                      params?: Router.UnknownOutputParams
                  }
                | {
                      pathname: `${'/(app)'}/rooms` | `/rooms`
                      params?: Router.UnknownOutputParams
                  }
                | {
                      pathname: `${'/(app)'}/settings` | `/settings`
                      params?: Router.UnknownOutputParams
                  }
                | {
                      pathname: `${'/(app)'}${'/(tabs)'}/devices` | `/devices`
                      params?: Router.UnknownOutputParams
                  }
                | {
                      pathname: `${'/(app)'}${'/(tabs)'}/energy` | `/energy`
                      params?: Router.UnknownOutputParams
                  }
                | {
                      pathname: `${'/(app)'}${'/(tabs)'}` | `/`
                      params?: Router.UnknownOutputParams
                  }
            href:
                | Router.RelativePathString
                | Router.ExternalPathString
                | `/pair${`?${string}` | `#${string}` | ''}`
                | `/select-home${`?${string}` | `#${string}` | ''}`
                | `/welcome${`?${string}` | `#${string}` | ''}`
                | `/_sitemap${`?${string}` | `#${string}` | ''}`
                | `${'/(app)'}/account${`?${string}` | `#${string}` | ''}`
                | `/account${`?${string}` | `#${string}` | ''}`
                | `${'/(app)'}/rooms${`?${string}` | `#${string}` | ''}`
                | `/rooms${`?${string}` | `#${string}` | ''}`
                | `${'/(app)'}/settings${`?${string}` | `#${string}` | ''}`
                | `/settings${`?${string}` | `#${string}` | ''}`
                | `${'/(app)'}${'/(tabs)'}/devices${`?${string}` | `#${string}` | ''}`
                | `/devices${`?${string}` | `#${string}` | ''}`
                | `${'/(app)'}${'/(tabs)'}/energy${`?${string}` | `#${string}` | ''}`
                | `/energy${`?${string}` | `#${string}` | ''}`
                | `${'/(app)'}${'/(tabs)'}${`?${string}` | `#${string}` | ''}`
                | `/${`?${string}` | `#${string}` | ''}`
                | {
                      pathname:
                          | Router.RelativePathString
                          | Router.ExternalPathString
                          | `/pair`
                          | `/select-home`
                          | `/welcome`
                          | `/_sitemap`
                          | `${'/(app)'}/account`
                          | `/account`
                          | `${'/(app)'}/rooms`
                          | `/rooms`
                          | `${'/(app)'}/settings`
                          | `/settings`
                          | `${'/(app)'}${'/(tabs)'}/devices`
                          | `/devices`
                          | `${'/(app)'}${'/(tabs)'}/energy`
                          | `/energy`
                          | `${'/(app)'}${'/(tabs)'}`
                          | `/`
                      params?: Router.UnknownInputParams
                  }
        }
    }
}
