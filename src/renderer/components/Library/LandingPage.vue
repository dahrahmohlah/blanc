<template>
  <div class="wrapper">
    <sweet-modal
      modal-theme="dark"
      overlay-theme="dark"
      blocking
      hide-close-button
      icon="warning"
      ref="modal"
    >
      <h1>There are no files in your library!</h1>
      <material-button rounded flat to="/settings/library" slot="button">Manage Library</material-button>
    </sweet-modal>
    <!-- <div class="item-row">
      <span class="item-row--title">Albums</span>
      <div class="item-row--content" v-if="albums"> -->
    <div class="wrapper-message" v-if="indexing">
      <h1>Indexing library, please wait...</h1>
      <loading-indicator :fullHeight="false" />
    </div>
    <router-view v-if="!indexing"/>
  </div>
</template>

<script>
// import AlbumArt from '@/components/Partials/AlbumArt'
import MaterialButton from '@/components/Partials/MaterialButton'
import LoadingIndicator from '@/components/Partials/LoadingIndicator'
import db from '@/library.db'
// import { getLibrary, getAlbums } from '@/lazy-loaders'

// import { getAlbumArt } from '@/lazy-loaders'

export default {
  name: 'library-landing-page',
  data: () => ({
    loading: false
  }),
  mounted () {
    this.$store.commit('SHOW_CHROME')
    this.$store.commit('SHOW_MUSIC_BAR')
  },
  watch: {
    library (newVal) {
      if (newVal != null && newVal === 0) {
        console.log(this.$refs)
        this.$refs.modal.open()
      }
    }
  },
  computed: {
    indexing () {
      return this.$store.state.Library.indexing
    }
  },
  asyncComputed: {
    library () {
      return db.countAsync({})
    }
  },
  components: {
    MaterialButton,
    LoadingIndicator
  },
  methods: {
    entering (el) {
      console.log('enter')
      this.loading = false
    },
    leaving (el) {
      console.log('leave')
      this.loading = true
    }
  }
}
</script>

<style>
  .wrapper-message {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
</style>
