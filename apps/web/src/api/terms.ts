import type {
  Term,
  TermCreate,
  TermResponse,
  TermsResponse,
  TermUpdate,
} from '@webnovel-hub/shared';
import { apiRequest } from './client';

const id = (value: string) => encodeURIComponent(value);

/** /terms: text the reader swaps in chapters as they are shown. */
export const termsApi = {
  /** Every term, those for every novel first. */
  list: async (signal?: AbortSignal): Promise<Term[]> =>
    (await apiRequest<TermsResponse>('/terms', { signal })).terms,

  /** The terms a novel's chapters use: its own and those for every novel. */
  forNovel: async (novelId: string, signal?: AbortSignal): Promise<Term[]> =>
    (await apiRequest<TermsResponse>(`/novels/${id(novelId)}/terms`, { signal })).terms,

  create: async (fields: TermCreate): Promise<Term> =>
    (await apiRequest<TermResponse>('/terms', { method: 'POST', body: fields })).term,

  update: async (termId: string, changes: TermUpdate): Promise<Term> =>
    (await apiRequest<TermResponse>(`/terms/${id(termId)}`, { method: 'PATCH', body: changes }))
      .term,

  remove: (termId: string) => apiRequest<null>(`/terms/${id(termId)}`, { method: 'DELETE' }),
};
