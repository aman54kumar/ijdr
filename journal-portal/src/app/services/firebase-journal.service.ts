import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  getDocs,
  where,
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  iJournal,
  BoardMember,
  FirebaseBoardMember,
} from '../type/journals.type';

export interface FirebaseJournal {
  id?: string;
  title: string;
  edition?: 'January-June' | 'July-December'; // Optional for backward compatibility
  volume: number;
  number: number;
  year: string;
  description?: string;
  ssn?: string; // ISSN
  pdfUrl: string;
  pdfFileName?: string;
  fileSize?: number;
  viewCount?: number; // Real view tracking
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

@Injectable({
  providedIn: 'root',
})
export class FirebaseJournalService {
  constructor(private firestore: Firestore, private storage: Storage) {}

  // Helper method to clean data for Firestore (remove null/undefined values)
  private cleanFirestoreData(data: any): any {
    const cleaned: any = {};

    // Fields that should allow empty strings (can be cleared)
    const allowEmptyStringFields = [
      'description',
      'affiliation',
      'bio',
      'bioContentType',
      'email',
      'phone',
    ];

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        if (value === '' && allowEmptyStringFields.includes(key)) {
          // Allow empty strings for these fields (they can be cleared)
          cleaned[key] = '';
        } else if (value !== '') {
          // Include non-empty values
          cleaned[key] = value;
        }
        // Skip empty strings for other fields (they get filtered out)
      }
    }
    return cleaned;
  }

  // Get all journals
  getJournals(): Observable<FirebaseJournal[]> {
    const journalsRef = collection(this.firestore, 'journals');
    return (
      collectionData(
        query(
          journalsRef,
          orderBy('year', 'desc'),
          orderBy('volume', 'desc'),
          orderBy('number', 'desc')
        ),
        { idField: 'id' }
      ) as Observable<FirebaseJournal[]>
    ).pipe(
      map((journals: FirebaseJournal[]) => {
        // Sort by createdAt first (newest first), then by academic order
        // Handle missing createdAt fields gracefully
        return journals.sort((a, b) => {
          // First sort by createdAt if both have it
          if (a.createdAt && b.createdAt) {
            const aTime = a.createdAt.toMillis();
            const bTime = b.createdAt.toMillis();
            if (aTime !== bTime) {
              return bTime - aTime; // Newest first
            }
          } else if (a.createdAt && !b.createdAt) {
            return -1; // a (with createdAt) comes first
          } else if (!a.createdAt && b.createdAt) {
            return 1; // b (with createdAt) comes first
          }

          // Then sort by academic order (year, volume, number)
          if (a.year !== b.year) {
            return parseInt(b.year) - parseInt(a.year);
          }
          if (a.volume !== b.volume) {
            return b.volume - a.volume;
          }
          return b.number - a.number;
        });
      })
    );
  }

  // Get single journal by ID
  getJournalById(id: string): Observable<FirebaseJournal | null> {
    const journalRef = doc(this.firestore, 'journals', id);
    return docData(journalRef, {
      idField: 'id',
    }) as Observable<FirebaseJournal | null>;
  }

  // Create journal with PDF upload
  async createJournal(
    journalData: Omit<
      FirebaseJournal,
      'id' | 'createdAt' | 'updatedAt' | 'pdfUrl'
    >,
    pdfFile: File
  ): Promise<string> {
    try {
      console.log('Starting journal creation process...');
      console.log('Journal data to save:', journalData);

      const journalsRef = collection(this.firestore, 'journals');
      const now = Timestamp.now();

      // Clean the journal data to remove any null/undefined values
      const cleanedData = this.cleanFirestoreData(journalData);

      const documentData = {
        ...cleanedData,
        pdfUrl: '', // Temporary empty URL
        pdfFileName: pdfFile.name,
        fileSize: pdfFile.size,
        createdAt: now,
        updatedAt: now,
      };

      console.log('Final document data:', documentData);
      console.log('Creating document in Firestore...');

      // First create the journal document to get an ID
      const docRef = await addDoc(journalsRef, documentData);
      console.log('Document created successfully with ID:', docRef.id);

      console.log('Starting PDF upload...');
      // Upload PDF file using the document ID
      const pdfUrl = await this.uploadJournalPDF(pdfFile, docRef.id);
      console.log('PDF uploaded successfully. URL:', pdfUrl);

      console.log('Updating document with PDF URL...');
      // Update the document with the actual PDF URL
      await updateDoc(docRef, { pdfUrl });
      console.log('Document updated successfully.');

      return docRef.id;
    } catch (error) {
      console.error('Error in createJournal:', error);
      console.error('Error details:', {
        name: (error as any)?.name,
        message: (error as any)?.message,
        code: (error as any)?.code,
        stack: (error as any)?.stack,
      });
      throw error;
    }
  }

  // Update journal
  async updateJournal(
    id: string,
    journalData: Partial<FirebaseJournal>,
    pdfFile?: File
  ): Promise<void> {
    const journalRef = doc(this.firestore, 'journals', id);

    let updateData: any = {
      ...journalData,
      updatedAt: Timestamp.now(),
    };

    // If new PDF file is provided, upload it
    if (pdfFile) {
      // Delete old PDF first
      const currentJournal = await docData(journalRef);
      currentJournal.subscribe(async (journal) => {
        if (journal && journal['pdfUrl']) {
          try {
            const oldPdfRef = ref(this.storage, journal['pdfUrl']);
            await deleteObject(oldPdfRef);
          } catch (error) {
            console.warn('Old PDF deletion failed:', error);
          }
        }
      });

      // Upload new PDF
      const pdfUrl = await this.uploadJournalPDF(pdfFile, id);
      updateData = {
        ...updateData,
        pdfUrl,
        pdfFileName: pdfFile.name,
        fileSize: pdfFile.size,
      };
    }

    await updateDoc(journalRef, updateData);
  }

  // Delete journal
  async deleteJournal(id: string): Promise<void> {
    const journalRef = doc(this.firestore, 'journals', id);

    // Get journal data to delete PDF
    const journalData = await docData(journalRef);
    journalData.subscribe(async (journal) => {
      if (journal && journal['pdfUrl']) {
        try {
          const pdfRef = ref(this.storage, journal['pdfUrl']);
          await deleteObject(pdfRef);
        } catch (error) {
          console.warn('PDF deletion failed:', error);
        }
      }
    });

    // Delete the document
    await deleteDoc(journalRef);
  }

  // Increment view count when journal is viewed
  async incrementViewCount(journalId: string): Promise<void> {
    try {
      const journalRef = doc(this.firestore, 'journals', journalId);

      // Get current journal data
      const journalSnapshot = await getDocs(
        query(
          collection(this.firestore, 'journals'),
          where('__name__', '==', journalId)
        )
      );

      if (!journalSnapshot.empty) {
        const currentData = journalSnapshot.docs[0].data();
        const currentViewCount = currentData['viewCount'] || 0;

        // Increment view count
        await updateDoc(journalRef, {
          viewCount: currentViewCount + 1,
          updatedAt: Timestamp.now(),
        });

        console.log(
          `View count incremented for journal ${journalId}: ${
            currentViewCount + 1
          }`
        );
      }
    } catch (error) {
      console.error('Error incrementing view count:', error);
      // Don't throw error - view counting shouldn't break the app
    }
  }

  // Upload PDF file to Firebase Storage
  private async uploadJournalPDF(
    file: File,
    journalId: string
  ): Promise<string> {
    const fileName = `journals/${journalId}/${file.name}`;
    const storageRef = ref(this.storage, fileName);

    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }

  // Search journals
  searchJournals(searchTerm: string): Observable<FirebaseJournal[]> {
    // Note: For complex search, consider using Algolia or other search service
    // This is a simple client-side filter
    return new Observable((subscriber) => {
      this.getJournals().subscribe((journals) => {
        if (!searchTerm.trim()) {
          subscriber.next(journals);
          return;
        }

        const term = searchTerm.toLowerCase();
        const filtered = journals.filter(
          (journal) =>
            journal.title.toLowerCase().includes(term) ||
            journal.volume.toString().includes(term) ||
            journal.number.toString().includes(term) ||
            journal.year.toLowerCase().includes(term) ||
            journal.description?.toLowerCase().includes(term) ||
            journal.ssn?.toLowerCase().includes(term)
        );
        subscriber.next(filtered);
      });
    });
  }

  // ==================== BOARD MEMBER MANAGEMENT ====================

  /**
   * Get all board members ordered by position and order
   */
  getBoardMembers(): Observable<BoardMember[]> {
    const boardRef = collection(this.firestore, 'boardMembers');
    return collectionData(
      query(
        boardRef,
        where('isActive', '==', true),
        orderBy('position'),
        orderBy('order')
      ),
      { idField: 'id' }
    ).pipe(
      map((members: any[]) =>
        members.map((member) =>
          this.mapFirebaseBoardMemberToBoardMember(
            member as FirebaseBoardMember
          )
        )
      )
    ) as Observable<BoardMember[]>;
  }

  /**
   * Get board members by position
   */
  getBoardMembersByPosition(position: string): Observable<BoardMember[]> {
    const boardRef = collection(this.firestore, 'boardMembers');
    return collectionData(
      query(
        boardRef,
        where('position', '==', position),
        where('isActive', '==', true),
        orderBy('order')
      ),
      { idField: 'id' }
    ).pipe(
      map((members: any[]) =>
        members.map((member) =>
          this.mapFirebaseBoardMemberToBoardMember(
            member as FirebaseBoardMember
          )
        )
      )
    ) as Observable<BoardMember[]>;
  }

  /**
   * Get a single board member by ID
   */
  getBoardMember(id: string): Observable<BoardMember | null> {
    const memberDoc = doc(this.firestore, 'boardMembers', id);
    return docData(memberDoc, { idField: 'id' }).pipe(
      map((member: any) =>
        member
          ? this.mapFirebaseBoardMemberToBoardMember(
              member as FirebaseBoardMember
            )
          : null
      )
    ) as Observable<BoardMember | null>;
  }

  /**
   * Create a new board member
   */
  async createBoardMember(
    memberData: Omit<BoardMember, 'id' | 'createdAt' | 'updatedAt'>,
    imageFile?: File
  ): Promise<string> {
    try {
      const now = Timestamp.now();
      const documentData = this.cleanFirestoreData({
        ...memberData,
        createdAt: now,
        updatedAt: now,
      });

      const boardRef = collection(this.firestore, 'boardMembers');
      const docRef = await addDoc(boardRef, documentData);

      // Upload image if provided
      if (imageFile) {
        const imageUrl = await this.uploadBoardMemberImage(
          imageFile,
          docRef.id
        );
        await updateDoc(docRef, { imageUrl });
      }

      return docRef.id;
    } catch (error) {
      console.error('Error creating board member:', error);
      throw error;
    }
  }

  /**
   * Update an existing board member
   */
  async updateBoardMember(
    id: string,
    memberData: Partial<Omit<BoardMember, 'id' | 'createdAt'>>,
    imageFile?: File
  ): Promise<void> {
    try {
      const updateData = this.cleanFirestoreData({
        ...memberData,
        updatedAt: Timestamp.now(),
      });

      // Upload new image if provided
      if (imageFile) {
        const imageUrl = await this.uploadBoardMemberImage(imageFile, id);
        updateData.imageUrl = imageUrl;
      }

      const memberDoc = doc(this.firestore, 'boardMembers', id);
      await updateDoc(memberDoc, updateData);
    } catch (error) {
      console.error('Error updating board member:', error);
      throw error;
    }
  }

  /**
   * Delete a board member (soft delete by setting isActive to false)
   */
  async deleteBoardMember(id: string): Promise<void> {
    try {
      const memberDoc = doc(this.firestore, 'boardMembers', id);
      await updateDoc(memberDoc, {
        isActive: false,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error deleting board member:', error);
      throw error;
    }
  }

  /**
   * Upload board member image to Firebase Storage
   */
  private async uploadBoardMemberImage(
    file: File,
    memberId: string
  ): Promise<string> {
    try {
      const fileName = `board-member-${memberId}-${Date.now()}.${file.name
        .split('.')
        .pop()}`;
      const storageRef = ref(
        this.storage,
        `boardMembers/${memberId}/${fileName}`
      );

      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      return downloadURL;
    } catch (error) {
      console.error('Error uploading board member image:', error);
      throw error;
    }
  }

  /**
   * Generate next order number for a position
   */
  async getNextOrderForPosition(position: string): Promise<number> {
    try {
      const boardRef = collection(this.firestore, 'boardMembers');
      const q = query(
        boardRef,
        where('position', '==', position),
        orderBy('order', 'desc')
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return 1;
      }

      const maxOrder = snapshot.docs[0].data()['order'] || 0;
      return maxOrder + 1;
    } catch (error) {
      console.error('Error getting next order:', error);
      return 1;
    }
  }

  /**
   * Map Firebase board member to BoardMember interface
   */
  private mapFirebaseBoardMemberToBoardMember(
    firebaseMember: FirebaseBoardMember
  ): BoardMember {
    return {
      ...firebaseMember,
      position: firebaseMember.position as BoardMember['position'],
      bioContentType: firebaseMember.bioContentType as 'text' | 'list',
      // Ensure bio is properly typed based on bioContentType
      bio:
        firebaseMember.bioContentType === 'list'
          ? Array.isArray(firebaseMember.bio)
            ? firebaseMember.bio
            : typeof firebaseMember.bio === 'string'
            ? firebaseMember.bio
                .split('\n')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : []
          : firebaseMember.bio,
      dynamicSections: (firebaseMember.dynamicSections || []).map(
        (section) => ({
          ...section,
          contentType: section.contentType as 'text' | 'list',
          // Ensure content is properly typed based on contentType
          content:
            section.contentType === 'list'
              ? Array.isArray(section.content)
                ? section.content
                : typeof section.content === 'string'
                ? section.content
                    .split('\n')
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0)
                : []
              : section.content,
        })
      ),
    };
  }
}
