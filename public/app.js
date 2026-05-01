const movies = [
  {
    title: 'Midnight Seoul',
    year: '2026',
    genre: 'Drama',
    image: 'https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'The Last Premiere',
    year: '2025',
    genre: 'Thriller',
    image: 'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Winter Signal',
    year: '2024',
    genre: 'Mystery',
    image: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'City of Echoes',
    year: '2026',
    genre: 'Crime',
    image: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Golden Hour',
    year: '2025',
    genre: 'Romance',
    image: 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Silent Reel',
    year: '2023',
    genre: 'Noir',
    image: 'https://images.unsplash.com/photo-1485095329183-d0797cdc5676?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'After the Credits',
    year: '2026',
    genre: 'Drama',
    image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Neon Rain',
    year: '2024',
    genre: 'Action',
    image: 'https://images.unsplash.com/photo-1543536448-d209d2d13a1c?auto=format&fit=crop&w=700&q=80'
  }
];

const grid = document.querySelector('#movieGrid');
const searchInput = document.querySelector('#searchInput');
const emptyState = document.querySelector('#emptyState');
const movieCount = document.querySelector('#movieCount');

function renderMovies(items) {
  grid.innerHTML = items.map((movie) => `
    <article class="movie-card">
      <img class="poster" src="${movie.image}" alt="${movie.title} poster" loading="lazy">
      <div class="movie-info">
        <h3 class="movie-title">${movie.title}</h3>
        <p class="movie-meta">${movie.year} · ${movie.genre}</p>
      </div>
    </article>
  `).join('');

  emptyState.hidden = items.length > 0;
  movieCount.textContent = `${items.length} ${items.length === 1 ? 'movie' : 'movies'}`;
}

searchInput.addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  const filtered = movies.filter((movie) => {
    return movie.title.toLowerCase().includes(query) || movie.genre.toLowerCase().includes(query);
  });

  renderMovies(filtered);
});

renderMovies(movies);
