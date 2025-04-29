import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { ApolloQueryResult } from '@apollo/client/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GetJournalByIdResponse, iJournal } from '../type/journals.type';

@Injectable({
  providedIn: 'root',
})
export class JournalService {
  constructor(private apollo: Apollo) {}

  getJournals(): Observable<iJournal[]> {
    return this.apollo
      .query<{ journals: iJournal[] }>({
        query: gql`
          query GetJournalsWithArticles {
            journals {
              id
              volume
              number
              edition
              ssn
              articles {
                id
                articleNumber
                title
                authors
                abstract
                pdfUrl
                tags {
                  id
                  name
                }
              }
            }
          }
        `,
      })
      .pipe(
        map((result: ApolloQueryResult<{ journals: iJournal[] }>) => {
          return result.data.journals;
        })
      );
  }

  getJournalById(id: number) {
    return this.apollo
      .query<GetJournalByIdResponse>({
        query: gql`
          query ($id: Int!) {
            journal(id: $id) {
              id
              volume
              number
              edition
              articles {
                id
                title
                abstract
                authors
                tags {
                  id
                  name
                }
                pdfUrl
              }
            }
          }
        `,
        variables: { id },
      })
      .pipe(map((result) => result.data.journal));
  }
}
